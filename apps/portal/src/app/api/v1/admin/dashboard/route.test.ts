// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/admin-review-service", () => ({
  getDashboardSummary: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { getDashboardSummary } from "@/services/admin-review-service";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockSummary = {
  pendingCount: 5,
  reviewsToday: 3,
  avgReviewTimeMs: 300000,
  approvalRate: 0.7,
  rejectionRate: 0.2,
  changesRequestedRate: 0.1,
};

function makeRequest(): Request {
  return new Request("https://jobs.igbo.com/api/v1/admin/dashboard", {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getDashboardSummary).mockResolvedValue(mockSummary);
});

describe("GET /api/v1/admin/dashboard", () => {
  it("returns activity summary for JOB_ADMIN (200)", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pendingCount).toBe(5);
    expect(body.data.reviewsToday).toBe(3);
    expect(body.data.approvalRate).toBe(0.7);
  });

  it("rejects non-admin role with 403", async () => {
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

  it("returns correct metrics structure", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data).toMatchObject({
      pendingCount: expect.any(Number),
      reviewsToday: expect.any(Number),
      approvalRate: expect.any(Number),
      rejectionRate: expect.any(Number),
      changesRequestedRate: expect.any(Number),
    });
  });
});
