// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@igbo/db/queries/portal-admin-all-companies", () => ({
  listAllCompaniesForAdmin: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listAllCompaniesForAdmin } from "@igbo/db/queries/portal-admin-all-companies";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockResult = {
  companies: [
    {
      id: "company-1",
      name: "Tech Corp",
      trustBadge: true,
      ownerName: "John Doe",
      verificationDisplayStatus: "verified" as const,
      activePostingCount: 3,
      openViolationCount: 0,
      createdAt: new Date("2026-03-01"),
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

function makeRequest(params = ""): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/companies${params}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(listAllCompaniesForAdmin).mockResolvedValue(mockResult);
});

describe("GET /api/v1/admin/companies", () => {
  it("returns 200 with paginated companies for JOB_ADMIN", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.companies).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.totalPages).toBe(1);
  });

  it("returns 403 for non-admin (JOB_SEEKER)", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Authentication required", status: 401 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("defaults to page=1, pageSize=20 when not provided", async () => {
    await GET(makeRequest());
    expect(listAllCompaniesForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it("parses page and pageSize from query params", async () => {
    await GET(makeRequest("?page=2&pageSize=10"));
    expect(listAllCompaniesForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });

  it("clamps pageSize to max 100", async () => {
    await GET(makeRequest("?pageSize=500"));
    expect(listAllCompaniesForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 100 }),
    );
  });

  it("passes valid verification filter through", async () => {
    await GET(makeRequest("?verification=verified"));
    expect(listAllCompaniesForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ verification: "verified" }),
    );
  });

  it("passes 'pending' verification filter through", async () => {
    await GET(makeRequest("?verification=pending"));
    expect(listAllCompaniesForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ verification: "pending" }),
    );
  });

  it("ignores invalid verification values (does not pass through)", async () => {
    await GET(makeRequest("?verification=malicious_value"));
    expect(listAllCompaniesForAdmin).toHaveBeenCalledWith(
      expect.not.objectContaining({ verification: expect.anything() }),
    );
  });

  it("returns companies data in response body", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data.companies[0]).toMatchObject({
      id: "company-1",
      name: "Tech Corp",
      verificationDisplayStatus: "verified",
    });
  });
});
