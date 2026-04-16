// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-posting-reports", () => ({
  listPostingsWithActiveReports: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listPostingsWithActiveReports } from "@igbo/db/queries/portal-posting-reports";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(listPostingsWithActiveReports).mockResolvedValue({ items: [], total: 0 });
});

describe("GET /api/v1/admin/reports", () => {
  it("returns 200 with report queue data", async () => {
    const item = {
      postingId: "posting-1",
      postingTitle: "Engineer",
      companyName: "Corp",
      companyId: "company-1",
      reportCount: 3,
      latestReportAt: new Date(),
      priority: "elevated" as const,
    };
    vi.mocked(listPostingsWithActiveReports).mockResolvedValue({ items: [item], total: 1 });

    const req = new Request("http://localhost/api/v1/admin/reports");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(listPostingsWithActiveReports).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });

  it("passes pagination params to query", async () => {
    const req = new Request("http://localhost/api/v1/admin/reports?limit=10&offset=20");
    await GET(req);

    expect(listPostingsWithActiveReports).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });

  it("requires admin role", async () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    vi.mocked(requireJobAdminRole).mockRejectedValue(err);

    const req = new Request("http://localhost/api/v1/admin/reports");
    await expect(GET(req)).rejects.toMatchObject({ status: 403 });
  });
});
