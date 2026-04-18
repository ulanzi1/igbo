// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@igbo/db/queries/portal-admin-all-postings", () => ({
  listAllPostingsForAdmin: vi.fn(),
  PORTAL_JOB_STATUS_VALUES: [
    "draft",
    "pending_review",
    "active",
    "paused",
    "filled",
    "expired",
    "rejected",
  ],
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listAllPostingsForAdmin } from "@igbo/db/queries/portal-admin-all-postings";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockResult = {
  postings: [
    {
      id: "posting-1",
      title: "Software Engineer",
      status: "active" as const,
      location: "Lagos",
      employmentType: "full_time",
      archivedAt: null,
      createdAt: new Date("2026-03-01"),
      companyId: "company-1",
      companyName: "Tech Corp",
      companyTrustBadge: true,
      employerName: "John Doe",
      applicationDeadline: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

function makeRequest(params = ""): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/postings${params}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(listAllPostingsForAdmin).mockResolvedValue(mockResult);
});

describe("GET /api/v1/admin/postings", () => {
  it("returns 200 with paginated postings for JOB_ADMIN", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.postings).toHaveLength(1);
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
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it("parses page and pageSize from query params", async () => {
    await GET(makeRequest("?page=2&pageSize=10"));
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });

  it("clamps pageSize to max 100", async () => {
    await GET(makeRequest("?pageSize=500"));
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 100 }),
    );
  });

  it("passes status filter through", async () => {
    await GET(makeRequest("?status=active"));
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
  });

  it("passes 'archived' pseudo-status through", async () => {
    await GET(makeRequest("?status=archived"));
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
  });

  it("ignores invalid status values", async () => {
    await GET(makeRequest("?status=malicious_value"));
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
    );
  });

  it("passes companyId filter through", async () => {
    await GET(makeRequest("?companyId=company-abc"));
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-abc" }),
    );
  });

  it("passes dateFrom and dateTo as Date objects", async () => {
    await GET(makeRequest("?dateFrom=2026-01-01&dateTo=2026-03-31"));
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: new Date("2026-01-01"),
        dateTo: new Date("2026-03-31"),
      }),
    );
  });
});
