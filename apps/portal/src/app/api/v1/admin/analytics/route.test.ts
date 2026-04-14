// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@/services/admin-analytics-service", () => ({
  getPlatformAnalytics: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { getPlatformAnalytics } from "@/services/admin-analytics-service";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockAnalytics = {
  postings: {
    activeCount: { value: 10, trend: null },
    pendingReviewCount: { value: 3, trend: null },
    rejectedCount: { value: 2, trend: { direction: "up", percentChange: 100 } },
    expiredCount: { value: 5, trend: { direction: "stable", percentChange: 0 } },
  },
  applications: {
    submittedCount: { value: 20, trend: null },
    avgPerPosting: { value: 5, trend: null },
    interviewConversionRate: { value: 0.5, trend: null },
  },
  hiring: {
    medianTimeToFillDays: { value: 14.5, trend: null },
    hiresCount: { value: 5, trend: null },
    offerAcceptRate: { value: 0.625, trend: null },
  },
  users: {
    activeSeekers: { value: 12, trend: null },
    activeEmployers: { value: 5, trend: null },
    newRegistrations: { value: 20, trend: null },
  },
  review: {
    avgReviewTimeMs: 120000,
    approvalRate: { value: 0.7, trend: null },
    rejectionRate: { value: 0.2, trend: null },
    changesRequestedRate: { value: 0.1, trend: null },
  },
  generatedAt: "2026-04-14T10:00:00.000Z",
};

function makeRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/admin/analytics", {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
});

describe("GET /api/v1/admin/analytics", () => {
  it("returns 200 with analytics data for JOB_ADMIN", async () => {
    vi.mocked(getPlatformAnalytics).mockResolvedValue(mockAnalytics as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.postings.activeCount.value).toBe(10);
    expect(body.data.generatedAt).toBe("2026-04-14T10:00:00.000Z");
  });

  it("calls getPlatformAnalytics once", async () => {
    vi.mocked(getPlatformAnalytics).mockResolvedValue(mockAnalytics as never);
    await GET(makeRequest());
    expect(getPlatformAnalytics).toHaveBeenCalledOnce();
  });

  it("returns 403 for non-admin (JOB_SEEKER)", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated user", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});
