// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/admin-review-service", () => ({
  getReviewQueue: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { getReviewQueue } from "@/services/admin-review-service";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockQueueResult = {
  items: [
    {
      posting: {
        id: "posting-1",
        title: "Software Engineer",
        status: "pending_review",
        createdAt: new Date("2026-01-01"),
        employerTotalPostings: 3,
      },
      company: { id: "company-1", name: "Tech Corp", trustBadge: true },
      employerName: "John Doe",
      confidenceIndicator: {
        level: "high",
        verifiedEmployer: true,
        violationCount: 0,
        reportCount: 0,
        engagementLevel: "high",
      },
      isFirstTimeEmployer: false,
      screeningResult: null,
    },
  ],
  total: 1,
};

function makeRequest(url = "https://jobs.igbo.com/api/v1/admin/jobs/review"): Request {
  return new Request(url, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getReviewQueue).mockResolvedValue(mockQueueResult as never);
});

describe("GET /api/v1/admin/jobs/review", () => {
  it("returns paginated review queue for JOB_ADMIN (200)", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it("rejects EMPLOYER role with 403", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("rejects JOB_SEEKER role with 403", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated request with 401", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("respects page and pageSize query params", async () => {
    const res = await GET(
      makeRequest("https://jobs.igbo.com/api/v1/admin/jobs/review?page=2&pageSize=10"),
    );
    expect(res.status).toBe(200);
    expect(getReviewQueue).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 10 }));
  });

  it("filters by verifiedOnly when set to true", async () => {
    await GET(makeRequest("https://jobs.igbo.com/api/v1/admin/jobs/review?verifiedOnly=true"));
    expect(getReviewQueue).toHaveBeenCalledWith(expect.objectContaining({ verifiedOnly: true }));
  });

  it("returns empty array for no pending postings", async () => {
    vi.mocked(getReviewQueue).mockResolvedValue({ items: [], total: 0 } as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });
});
