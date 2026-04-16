// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@igbo/db/queries/portal-admin-audit-logs", () => ({
  listPortalAdminAuditLogs: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listPortalAdminAuditLogs } from "@igbo/db/queries/portal-admin-audit-logs";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockResult = {
  logs: [
    {
      id: "log-1",
      actorId: "admin-1",
      actorName: "Admin",
      action: "portal.posting.approve",
      targetUserId: null,
      targetType: "portal_job_posting",
      traceId: null,
      details: { postingId: "p1" },
      createdAt: "2026-04-10T10:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
  totalPages: 1,
};

function makeRequest(params = ""): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/audit-logs${params}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(listPortalAdminAuditLogs).mockResolvedValue(mockResult as never);
});

describe("GET /api/v1/admin/audit-logs", () => {
  it("returns 200 with paginated audit logs for JOB_ADMIN", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it("defaults to page=1, pageSize=50 when not provided", async () => {
    await GET(makeRequest());
    expect(listPortalAdminAuditLogs).toHaveBeenCalledWith(1, 50, {});
  });

  it("parses page and pageSize from query params", async () => {
    await GET(makeRequest("?page=2&pageSize=25"));
    expect(listPortalAdminAuditLogs).toHaveBeenCalledWith(2, 25, {});
  });

  it("clamps pageSize to max 100", async () => {
    await GET(makeRequest("?pageSize=200"));
    expect(listPortalAdminAuditLogs).toHaveBeenCalledWith(1, 100, {});
  });

  it("passes filter query params through to query function", async () => {
    await GET(
      makeRequest(
        "?action=portal.posting.approve&actorId=admin-1&targetType=portal_job_posting&dateFrom=2026-04-01&dateTo=2026-04-30",
      ),
    );
    expect(listPortalAdminAuditLogs).toHaveBeenCalledWith(1, 50, {
      action: "portal.posting.approve",
      actorId: "admin-1",
      targetType: "portal_job_posting",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });
  });

  it("returns 403 for non-admin", async () => {
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
