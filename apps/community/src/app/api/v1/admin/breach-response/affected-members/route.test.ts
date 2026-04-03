// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockRequireAdminSession, mockSelectWhere } = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockSelectWhere: vi.fn(),
}));

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db", () => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: mockSelectWhere,
  };
  return {
    db: {
      select: vi.fn().mockReturnValue(selectChain),
    },
  };
});

vi.mock("@igbo/db/schema/auth-users", () => ({
  authUsers: {
    id: "id",
    email: "email",
    name: "name",
    accountStatus: "account_status",
    createdAt: "created_at",
  },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const ADMIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeGetRequest(params: string) {
  return new Request(
    `https://example.com/api/v1/admin/breach-response/affected-members?${params}`,
    {
      method: "GET",
      headers: {
        Host: "example.com",
        Origin: "https://example.com",
      },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockSelectWhere.mockResolvedValue([]);
});

describe("GET /api/v1/admin/breach-response/affected-members", () => {
  it("returns 200 with members for valid date range", async () => {
    const req = makeGetRequest("since=2024-01-01T00:00:00Z&until=2024-12-31T23:59:59Z");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("members");
    expect(body.data).toHaveProperty("count");
  });

  it("returns 401 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const req = makeGetRequest("since=2024-01-01T00:00:00Z&until=2024-12-31T23:59:59Z");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when since is missing", async () => {
    const req = makeGetRequest("until=2024-12-31T23:59:59Z");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when until is missing", async () => {
    const req = makeGetRequest("since=2024-01-01T00:00:00Z");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const req = makeGetRequest("since=not-a-date&until=also-not-a-date");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Invalid date format");
  });
});
