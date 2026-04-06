// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/admin-review-service", () => ({
  getReviewDetail: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { getReviewDetail } from "@/services/admin-review-service";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockDetail = {
  posting: {
    id: "posting-1",
    title: "Software Engineer",
    descriptionHtml: "<p>Great role</p>",
    status: "pending_review",
    createdAt: new Date("2026-01-01"),
    revisionCount: 0,
  },
  company: { id: "company-1", name: "Tech Corp", trustBadge: true, ownerUserId: "user-1" },
  employerName: "John Doe",
  totalPostings: 5,
  approvedCount: 4,
  rejectedCount: 1,
  confidenceIndicator: {
    level: "high",
    verifiedEmployer: true,
    violationCount: 0,
    reportCount: 0,
    engagementLevel: "high",
  },
  screeningResult: null,
  reportCount: 0,
};

function makeRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/jobs/${jobId}/review`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getReviewDetail).mockResolvedValue(mockDetail as never);
});

describe("GET /api/v1/admin/jobs/[jobId]/review", () => {
  it("returns review detail for JOB_ADMIN (200)", async () => {
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.posting.id).toBe("posting-1");
    expect(body.data.company.name).toBe("Tech Corp");
    expect(body.data.totalPostings).toBe(5);
  });

  it("rejects non-admin role with 403", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated request with 401", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent jobId", async () => {
    vi.mocked(getReviewDetail).mockResolvedValue(null);
    const res = await GET(makeRequest("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns full review context in response", async () => {
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.approvedCount).toBe(4);
    expect(body.data.rejectedCount).toBe(1);
    expect(body.data.confidenceIndicator.level).toBe("high");
    expect(body.data.screeningResult).toBeNull();
  });
});
