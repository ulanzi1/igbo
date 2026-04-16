// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@igbo/db/queries/portal-admin-audit-logs", () => ({
  listPortalAdminAuditLogsForExport: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listPortalAdminAuditLogsForExport } from "@igbo/db/queries/portal-admin-audit-logs";
import { ApiError } from "@igbo/auth/api-error";
import { GET } from "./route";

const mockLogs = [
  {
    id: "log-1",
    actorId: "admin-1",
    actorName: "Admin User",
    action: "portal.posting.approve",
    targetUserId: null,
    targetType: "portal_job_posting",
    traceId: null,
    details: { postingId: "p1", decision: "approved" },
    createdAt: new Date("2026-04-10T10:00:00Z"),
  },
  {
    id: "log-2",
    actorId: "admin-2",
    actorName: null,
    action: "portal.flag.create",
    targetUserId: null,
    targetType: "portal_admin_flag",
    traceId: null,
    details: { flagId: "f1" },
    createdAt: new Date("2026-04-11T10:00:00Z"),
  },
];

function makeRequest(params = ""): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/audit-logs/export${params}`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(listPortalAdminAuditLogsForExport).mockResolvedValue(mockLogs as never);
});

describe("GET /api/v1/admin/audit-logs/export", () => {
  it("returns CSV with correct Content-Type header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
  });

  it("returns Content-Disposition with filename pattern", async () => {
    const res = await GET(makeRequest("?dateFrom=2026-04-01&dateTo=2026-04-30"));
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("igbo_admin_audit_log_2026-04-01_2026-04-30_");
  });

  it("CSV content includes header row and data rows", async () => {
    const res = await GET(makeRequest());
    const csv = await res.text();
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Timestamp,Admin,Action,Target Type,Details");
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[1]).toContain("Admin User");
    expect(lines[1]).toContain("portal.posting.approve");
  });

  it("falls back to 'Unknown' for null actorName", async () => {
    const res = await GET(makeRequest());
    const csv = await res.text();
    const lines = csv.split("\n");
    expect(lines[2]).toContain("Unknown");
  });

  it("passes filters through to query function", async () => {
    await GET(makeRequest("?action=portal.posting.approve&targetType=portal_job_posting"));
    expect(listPortalAdminAuditLogsForExport).toHaveBeenCalledWith({
      action: "portal.posting.approve",
      targetType: "portal_job_posting",
    });
  });

  it("returns headers-only CSV when no data matches", async () => {
    vi.mocked(listPortalAdminAuditLogsForExport).mockResolvedValue([]);
    const res = await GET(makeRequest());
    const csv = await res.text();
    expect(csv).toBe("Timestamp,Admin,Action,Target Type,Details");
  });

  it("properly escapes fields with special characters", async () => {
    vi.mocked(listPortalAdminAuditLogsForExport).mockResolvedValue([
      {
        ...mockLogs[0],
        actorName: 'Admin "Bob" User',
        details: { note: "has,comma" },
      },
    ] as never);
    const res = await GET(makeRequest());
    const csv = await res.text();
    // Quotes should be doubled
    expect(csv).toContain('"Admin ""Bob"" User"');
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
