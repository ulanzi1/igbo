// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/admin-review-service", () => ({
  flagPosting: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { flagPosting } from "@/services/admin-review-service";
import { ApiError } from "@igbo/auth/api-error";
import { POST } from "./route";

const mockFlag = {
  id: "flag-1",
  postingId: "posting-1",
  adminUserId: "admin-1",
  category: "discriminatory_language",
  severity: "high",
  description: "The posting contains discriminatory language targeting applicants.",
  status: "open",
  autoPaused: true,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionAction: null,
  resolutionNote: null,
  createdAt: new Date("2026-04-01"),
};

function makeRequest(jobId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/jobs/${jobId}/flag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "jobs.igbo.com",
      Origin: "https://jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
});

describe("POST /api/v1/admin/jobs/[jobId]/flag", () => {
  it("creates a flag and returns 201", async () => {
    vi.mocked(flagPosting).mockResolvedValue(mockFlag as never);

    const req = makeRequest("posting-1", {
      category: "discriminatory_language",
      severity: "high",
      description: "The posting contains discriminatory language targeting applicants.",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("flag-1");
    expect(body.data.autoPaused).toBe(true);
    expect(flagPosting).toHaveBeenCalledWith(
      "posting-1",
      "admin-1",
      "discriminatory_language",
      "high",
      "The posting contains discriminatory language targeting applicants.",
    );
  });

  it("returns 400 for invalid category", async () => {
    const req = makeRequest("posting-1", {
      category: "invalid_category",
      severity: "high",
      description: "Some description that is long enough to pass validation.",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for description too short", async () => {
    const req = makeRequest("posting-1", {
      category: "other",
      severity: "low",
      description: "Too short",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid severity", async () => {
    const req = makeRequest("posting-1", {
      category: "other",
      severity: "critical",
      description: "Some description that is long enough to pass validation.",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin role", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );

    const req = makeRequest("posting-1", {
      category: "other",
      severity: "low",
      description: "Some description that is long enough to pass validation.",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 409 when posting already has open flag", async () => {
    vi.mocked(flagPosting).mockRejectedValue(
      new ApiError({
        title: "Posting already has an open flag",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.ALREADY_FLAGGED" },
      }),
    );

    const req = makeRequest("posting-1", {
      category: "other",
      severity: "low",
      description: "Some description that is long enough to pass validation.",
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 409 when posting is not active", async () => {
    vi.mocked(flagPosting).mockRejectedValue(
      new ApiError({
        title: "Only active postings can be flagged",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.INVALID_FLAG_TARGET" },
      }),
    );

    const req = makeRequest("posting-1", {
      category: "other",
      severity: "low",
      description: "Some description that is long enough to pass validation.",
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 400 for missing body", async () => {
    const req = new Request("https://jobs.igbo.com/api/v1/admin/jobs/posting-1/flag", {
      method: "POST",
      headers: {
        Host: "jobs.igbo.com",
        Origin: "https://jobs.igbo.com",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
