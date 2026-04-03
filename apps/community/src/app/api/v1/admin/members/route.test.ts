// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAdminSession = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@igbo/db/schema/auth-users", () => ({
  authUsers: {
    id: "id",
    email: "email",
    name: "name",
    role: "role",
    membershipTier: "membership_tier",
    accountStatus: "account_status",
    createdAt: "created_at",
    deletedAt: "deleted_at",
  },
}));

vi.mock("@igbo/db/schema/community-profiles", () => ({
  communityProfiles: { userId: "user_id", displayName: "display_name" },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const ADMIN_ID = "admin-uuid-1";

function makeGetRequest(params = "") {
  return new Request(`https://example.com/api/v1/admin/members${params}`, {
    method: "GET",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

const MOCK_MEMBERS = [
  {
    id: "user-1",
    email: "user1@test.com",
    name: "User One",
    role: "MEMBER",
    membershipTier: "BASIC",
    accountStatus: "APPROVED",
    createdAt: new Date("2026-01-01"),
    displayName: "User One",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });

  const mockLimit = vi.fn().mockReturnValue({
    offset: vi.fn().mockResolvedValue(MOCK_MEMBERS),
  });
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockJoin });

  const mockCountWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
  const mockCountJoin = vi.fn().mockReturnValue({ where: mockCountWhere });
  const mockCountFrom = vi.fn().mockReturnValue({ leftJoin: mockCountJoin });

  let callCount = 0;
  mockDbSelect.mockImplementation(() => {
    callCount++;
    if (callCount % 2 === 1) {
      return { from: mockFrom };
    }
    return { from: mockCountFrom };
  });
});

describe("GET /api/v1/admin/members", () => {
  it("returns 200 with members and pagination meta", async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.meta).toMatchObject({ page: 1, pageSize: 20 });
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid tier param", async () => {
    const req = makeGetRequest("?tier=INVALID");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
