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
  getReportsForPosting: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { getReportsForPosting } from "@igbo/db/queries/portal-posting-reports";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1" },
  } as never);
  vi.mocked(getReportsForPosting).mockResolvedValue([]);
});

describe("GET /api/v1/admin/reports/postings/[postingId]", () => {
  it("returns reports for posting", async () => {
    const reports = [{ id: "report-1", postingId: "posting-1" }];
    vi.mocked(getReportsForPosting).mockResolvedValue(reports as never);

    const req = new Request("http://localhost/api/v1/admin/reports/postings/posting-1");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(getReportsForPosting).toHaveBeenCalledWith("posting-1");
  });

  it("returns empty reports array for posting with no reports", async () => {
    const req = new Request("http://localhost/api/v1/admin/reports/postings/posting-none");
    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  it("requires admin role", async () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    vi.mocked(requireJobAdminRole).mockRejectedValue(err);

    const req = new Request("http://localhost/api/v1/admin/reports/postings/posting-1");
    await expect(GET(req)).rejects.toMatchObject({ status: 403 });
  });
});
