// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getArchivablePostings: vi.fn(),
  archivePosting: vi.fn(),
}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: vi.fn((handler: (req: Request) => Promise<Response>) => handler),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError {
    status: number;
    title: string;
    constructor({ title, status }: { title: string; status: number }) {
      this.title = title;
      this.status = status;
    }
  },
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn((data: unknown) => Response.json({ data }, { status: 200 })),
}));

import { getArchivablePostings, archivePosting } from "@igbo/db/queries/portal-job-postings";

const ARCHIVABLE_POSTING = {
  id: "jp-arch-1",
  companyId: "cp-1",
  title: "Old Role",
  status: "expired",
  expiresAt: new Date("2025-12-01"),
  archivedAt: null,
};

function makeRequest(authHeader?: string) {
  return new Request("http://localhost/api/v1/internal/jobs/archive-expired", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
  vi.mocked(getArchivablePostings).mockResolvedValue([]);
  vi.mocked(archivePosting).mockResolvedValue(0);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/internal/jobs/archive-expired", () => {
  it("finds and archives expired postings, returns count", async () => {
    vi.mocked(getArchivablePostings).mockResolvedValue([ARCHIVABLE_POSTING] as never);
    vi.mocked(archivePosting).mockResolvedValue(1);

    const { POST } = await import("./route");
    const res = await POST(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { archived: number } };
    expect(body.data.archived).toBe(1);
    expect(archivePosting).toHaveBeenCalledWith("jp-arch-1");
  });

  it("returns { archived: 0 } when no postings to archive", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { archived: number } };
    expect(body.data.archived).toBe(0);
  });

  it("rejects requests without Authorization header", async () => {
    const { POST } = await import("./route");
    await expect(POST(makeRequest())).rejects.toThrow();
  });

  it("rejects requests with wrong secret", async () => {
    const { POST } = await import("./route");
    await expect(POST(makeRequest("Bearer wrong-secret"))).rejects.toThrow();
  });

  it("accumulates count from multiple archived postings", async () => {
    vi.mocked(getArchivablePostings).mockResolvedValue([
      { ...ARCHIVABLE_POSTING, id: "jp-1" },
      { ...ARCHIVABLE_POSTING, id: "jp-2" },
    ] as never);
    vi.mocked(archivePosting).mockResolvedValue(1);

    const { POST } = await import("./route");
    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { data: { archived: number } };
    expect(body.data.archived).toBe(2);
    expect(archivePosting).toHaveBeenCalledTimes(2);
  });
});

describe("archive-expired route configuration", () => {
  it("is registered with skipCsrf: true (machine-to-machine endpoint)", async () => {
    vi.resetModules();
    vi.stubEnv("INTERNAL_JOB_SECRET", "test-secret");
    const { withApiHandler } = await import("@/lib/api-middleware");
    await import("./route");
    expect(withApiHandler).toHaveBeenCalledWith(expect.any(Function), { skipCsrf: true });
  });
});
