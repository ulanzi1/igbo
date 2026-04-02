// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAdminSession = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

const mockUpsertUserBadge = vi.fn();
const mockDeleteUserBadge = vi.fn();
const mockInvalidateBadgeCache = vi.fn();
vi.mock("@igbo/db/queries/badges", () => ({
  upsertUserBadge: (...args: unknown[]) => mockUpsertUserBadge(...args),
  deleteUserBadge: (...args: unknown[]) => mockDeleteUserBadge(...args),
  invalidateBadgeCache: (...args: unknown[]) => mockInvalidateBadgeCache(...args),
}));

const mockDbInsert = vi.fn();
const mockDbSelect = vi.fn();
vi.mock("@igbo/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@igbo/db/schema/audit-logs", () => ({
  auditLogs: {
    actorId: "actor_id",
    targetUserId: "target_user_id",
    action: "action",
    details: "details",
  },
}));

vi.mock("@igbo/db/schema/auth-users", () => ({
  authUsers: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

const mockRedis = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { PATCH, DELETE } from "./route";

const ADMIN_ID = "admin-uuid-1";
const USER_ID = "user-uuid-1";

function makeRequest(method: string, userId: string, body?: unknown): Request {
  return new Request(`https://example.com/api/v1/admin/members/${userId}/badge`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function setupUserExists(exists: boolean) {
  if (exists) {
    const mockLimit = vi.fn().mockResolvedValue([{ id: USER_ID }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbSelect.mockReturnValue({ from: mockFrom });
  } else {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbSelect.mockReturnValue({ from: mockFrom });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockUpsertUserBadge.mockResolvedValue(undefined);
  mockDeleteUserBadge.mockResolvedValue(true);
  mockInvalidateBadgeCache.mockResolvedValue(undefined);
  const mockValues = vi.fn().mockResolvedValue([]);
  mockDbInsert.mockReturnValue({ values: mockValues });
  setupUserExists(true);
});

// ─── PATCH /api/v1/admin/members/[id]/badge ───────────────────────────────────

describe("PATCH /api/v1/admin/members/[id]/badge", () => {
  it("1. assigns blue badge and returns 200", async () => {
    const req = makeRequest("PATCH", USER_ID, { badgeType: "blue" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.badgeType).toBe("blue");
  });

  it("2. assigns purple badge and returns 200", async () => {
    const req = makeRequest("PATCH", USER_ID, { badgeType: "purple" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.badgeType).toBe("purple");
  });

  it("3. upgrades existing badge — upsertUserBadge called with new type", async () => {
    const req = makeRequest("PATCH", USER_ID, { badgeType: "red" });
    await PATCH(req);
    expect(mockUpsertUserBadge).toHaveBeenCalledWith(USER_ID, "red", ADMIN_ID);
  });

  it("4. rejects invalid badgeType with 400", async () => {
    const req = makeRequest("PATCH", USER_ID, { badgeType: "gold" });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("5. requires admin session — returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const req = makeRequest("PATCH", USER_ID, { badgeType: "blue" });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("6. returns 404 for non-existent userId", async () => {
    setupUserExists(false);
    const req = makeRequest("PATCH", "nonexistent-id", { badgeType: "blue" });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it("7. invalidates badge cache after assignment", async () => {
    const req = makeRequest("PATCH", USER_ID, { badgeType: "blue" });
    await PATCH(req);
    expect(mockInvalidateBadgeCache).toHaveBeenCalledWith(USER_ID, expect.anything());
  });

  it("8. writes audit log with badge.assign action", async () => {
    const mockValues = vi.fn().mockResolvedValue([]);
    mockDbInsert.mockReturnValue({ values: mockValues });
    const req = makeRequest("PATCH", USER_ID, { badgeType: "red" });
    await PATCH(req);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "badge.assign", details: { badgeType: "red" } }),
    );
  });
});

// ─── DELETE /api/v1/admin/members/[id]/badge ──────────────────────────────────

describe("DELETE /api/v1/admin/members/[id]/badge", () => {
  it("9. removes badge and returns 200", async () => {
    const req = makeRequest("DELETE", USER_ID);
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.removed).toBe(true);
  });

  it("10. returns 404 for member with no such user", async () => {
    setupUserExists(false);
    const req = makeRequest("DELETE", "nonexistent-id");
    const res = await DELETE(req);
    expect(res.status).toBe(404);
  });

  it("11. returns 404 when user exists but has no badge", async () => {
    mockDeleteUserBadge.mockResolvedValue(false);
    const req = makeRequest("DELETE", USER_ID);
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toContain("no badge");
  });

  it("12. writes audit log with badge.remove action", async () => {
    const mockValues = vi.fn().mockResolvedValue([]);
    mockDbInsert.mockReturnValue({ values: mockValues });
    const req = makeRequest("DELETE", USER_ID);
    await DELETE(req);
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.remove" }));
  });
});
