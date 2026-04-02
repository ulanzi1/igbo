// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockListAuditLogs = vi.fn();

vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(opts: { title: string; status: number; detail?: string }) {
      super(opts.title);
      this.status = opts.status;
      this.name = "ApiError";
    }
    toProblemDetails() {
      return { type: "about:blank", title: this.message, status: this.status };
    }
  },
}));

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db/queries/audit-logs", () => ({
  listAuditLogs: (...args: unknown[]) => mockListAuditLogs(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const MOCK_RESULT = {
  logs: [
    {
      id: "log-1",
      actorId: "actor-1",
      actorName: "Admin",
      action: "BAN_MEMBER",
      targetUserId: "user-1",
      targetType: "user",
      traceId: null,
      details: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

function makeRequest(search = "") {
  return new Request(`https://example.com/api/v1/admin/audit-log${search}`, {
    method: "GET",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: "admin-1" });
  mockListAuditLogs.mockResolvedValue(MOCK_RESULT);
});

describe("GET /api/v1/admin/audit-log", () => {
  it("returns 200 with audit log data", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.page).toBe(1);
  });

  it("rejects unauthenticated requests with 403", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("passes filter params to listAuditLogs", async () => {
    await GET(
      makeRequest("?action=BAN_MEMBER&targetType=user&dateFrom=2026-01-01&dateTo=2026-01-31"),
    );
    expect(mockListAuditLogs).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({
        action: "BAN_MEMBER",
        targetType: "user",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      }),
    );
  });

  it("returns 400 for invalid date format", async () => {
    const res = await GET(makeRequest("?dateFrom=not-a-date"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when dateFrom > dateTo", async () => {
    const res = await GET(makeRequest("?dateFrom=2026-02-01&dateTo=2026-01-01"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid actorId (not UUID)", async () => {
    const res = await GET(makeRequest("?actorId=not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("uses default page=1 limit=20 when not specified", async () => {
    await GET(makeRequest());
    expect(mockListAuditLogs).toHaveBeenCalledWith(1, 20, expect.any(Object));
  });

  it("respects custom page and limit", async () => {
    await GET(makeRequest("?page=3&limit=50"));
    expect(mockListAuditLogs).toHaveBeenCalledWith(3, 50, expect.any(Object));
  });
});
