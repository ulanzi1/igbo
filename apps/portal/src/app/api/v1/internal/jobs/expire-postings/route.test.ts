// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getExpiredPostings: vi.fn(),
  getExpiringPostings: vi.fn(),
  batchExpirePostings: vi.fn(),
  getJobPostingWithCompany: vi.fn(),
}));
vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn().mockReturnValue(true) },
}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>) => handler),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError {
    status: number;
    title: string;
    extensions?: { code?: string };
    constructor({ title, status }: { title: string; status: number }) {
      this.title = title;
      this.status = status;
    }
  },
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ data }, { status: 200 })),
}));

import {
  getExpiredPostings,
  getExpiringPostings,
  batchExpirePostings,
  getJobPostingWithCompany,
} from "@igbo/db/queries/portal-job-postings";
import { portalEventBus } from "@/services/event-bus";

const EXPIRED_POSTING = {
  id: "jp-exp-1",
  companyId: "cp-1",
  title: "Software Engineer",
  expiresAt: new Date("2026-01-01"),
};

const EXPIRING_POSTING = {
  id: "jp-warn-1",
  companyId: "cp-2",
  title: "Marketing Manager",
  expiresAt: new Date(Date.now() + 86400000 * 2), // 2 days from now
};

function makeRequest(authHeader?: string) {
  return new Request("http://localhost/api/v1/internal/jobs/expire-postings", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

const MOCK_COMPANY = {
  id: "cp-1",
  ownerUserId: "user-owner-1",
  name: "Test Co",
  logoUrl: null,
  description: null,
  industry: "technology",
  companySize: "1-10",
  cultureInfo: null,
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
  vi.mocked(getExpiredPostings).mockResolvedValue([]);
  vi.mocked(getExpiringPostings).mockResolvedValue([]);
  vi.mocked(batchExpirePostings).mockResolvedValue(0);
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: EXPIRED_POSTING as never,
    company: MOCK_COMPANY as never,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/internal/jobs/expire-postings", () => {
  it("finds and expires postings, returns counts", async () => {
    vi.mocked(getExpiredPostings).mockResolvedValue([EXPIRED_POSTING] as never);
    vi.mocked(batchExpirePostings).mockResolvedValue(1);
    vi.mocked(getExpiringPostings).mockResolvedValue([]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { expired: number; warnings: number } };
    expect(body.data.expired).toBe(1);
    expect(body.data.warnings).toBe(0);
    expect(batchExpirePostings).toHaveBeenCalledWith(["jp-exp-1"]);
  });

  it("emits job.expired event with correct employerUserId from company owner", async () => {
    vi.mocked(getExpiredPostings).mockResolvedValue([EXPIRED_POSTING] as never);
    vi.mocked(batchExpirePostings).mockResolvedValue(1);

    const { POST } = await import("./route");
    await POST(makeRequest("Bearer test-secret"));

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "job.expired",
      expect.objectContaining({
        jobId: "jp-exp-1",
        companyId: "cp-1",
        employerUserId: "user-owner-1",
      }),
    );
  });

  it("emits job.expiry_warning event for postings approaching expiry", async () => {
    vi.mocked(getExpiredPostings).mockResolvedValue([]);
    vi.mocked(batchExpirePostings).mockResolvedValue(0);
    vi.mocked(getExpiringPostings).mockResolvedValue([EXPIRING_POSTING] as never);

    const { POST } = await import("./route");
    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { expired: number; warnings: number } };
    expect(body.data.warnings).toBe(1);
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "job.expiry_warning",
      expect.objectContaining({ jobId: "jp-warn-1", daysRemaining: expect.any(Number) }),
    );
  });

  it("returns { expired: 0, warnings: 0 } when no postings to process", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { expired: number; warnings: number } };
    expect(body.data.expired).toBe(0);
    expect(body.data.warnings).toBe(0);
  });

  it("rejects requests without Authorization header", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
    const { POST } = await import("./route");
    await expect(POST(makeRequest())).rejects.toThrow();
  });

  it("rejects requests with wrong secret", async () => {
    const { POST } = await import("./route");
    await expect(POST(makeRequest("Bearer wrong-secret"))).rejects.toThrow();
  });

  it("falls back to companyId as employerUserId when company join returns null", async () => {
    vi.mocked(getExpiredPostings).mockResolvedValue([EXPIRED_POSTING] as never);
    vi.mocked(batchExpirePostings).mockResolvedValue(1);
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);

    const { POST } = await import("./route");
    await POST(makeRequest("Bearer test-secret"));

    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "job.expired",
      expect.objectContaining({ employerUserId: "cp-1" }),
    );
  });
});

describe("expire-postings route configuration", () => {
  it("is registered with skipCsrf: true (machine-to-machine endpoint)", async () => {
    // withApiHandler mock captures its call args. Since vi.clearAllMocks() runs
    // in beforeEach and the module was already loaded, we need a fresh import.
    // Reset module registry to force re-evaluation:
    vi.resetModules();
    // Re-apply env stub (resetModules clears module cache, not env stubs)
    vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
    const { withApiHandler } = await import("@/lib/api-middleware");
    await import("./route");
    expect(withApiHandler).toHaveBeenCalledWith(expect.any(Function), { skipCsrf: true });
  });
});
