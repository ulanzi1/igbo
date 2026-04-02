// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockFindUserById = vi.fn();
const mockListMemberDisciplineHistory = vi.fn();
const mockGetActiveSuspension = vi.fn();
const mockGetProfileByUserId = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

vi.mock("@igbo/db/queries/member-discipline", () => ({
  listMemberDisciplineHistory: (...args: unknown[]) => mockListMemberDisciplineHistory(...args),
  getActiveSuspension: (...args: unknown[]) => mockGetActiveSuspension(...args),
}));

vi.mock("@igbo/db/queries/community-profiles", () => ({
  getProfileByUserId: (...args: unknown[]) => mockGetProfileByUserId(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const ADMIN_ID = "admin-uuid-1";
const VALID_UUID = "00000000-0000-4000-8000-000000000001";

const MOCK_USER = {
  id: VALID_UUID,
  name: "Alice",
  email: "alice@example.com",
  accountStatus: "APPROVED",
};

function makeRequest(userId: string) {
  return new Request(`https://example.com/api/v1/admin/discipline/${userId}`, {
    method: "GET",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockFindUserById.mockResolvedValue(MOCK_USER);
  mockListMemberDisciplineHistory.mockResolvedValue([]);
  mockGetActiveSuspension.mockResolvedValue(null);
  mockGetProfileByUserId.mockResolvedValue(null);
});

describe("GET /api/v1/admin/discipline/[userId]", () => {
  it("returns 200 with user info, discipline history, and active suspension", async () => {
    const history = [{ id: "d-1", actionType: "warning", reason: "spam" }];
    const suspension = { id: "d-2", actionType: "suspension", status: "active" };
    mockListMemberDisciplineHistory.mockResolvedValue(history);
    mockGetActiveSuspension.mockResolvedValue(suspension);

    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.id).toBe(VALID_UUID);
    expect(body.data.user.name).toBe("Alice");
    expect(body.data.user.email).toBe("alice@example.com");
    expect(body.data.user.accountStatus).toBe("APPROVED");
    expect(body.data.disciplineHistory).toEqual(history);
    expect(body.data.activeSuspension).toEqual(suspension);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown user", async () => {
    mockFindUserById.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("returns displayName from profile if available, falls back to user.name", async () => {
    // With profile displayName
    mockGetProfileByUserId.mockResolvedValue({ displayName: "Alice Display" });
    const res1 = await GET(makeRequest(VALID_UUID));
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data.user.displayName).toBe("Alice Display");

    // Without profile — falls back to user.name
    vi.clearAllMocks();
    mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
    mockFindUserById.mockResolvedValue(MOCK_USER);
    mockListMemberDisciplineHistory.mockResolvedValue([]);
    mockGetActiveSuspension.mockResolvedValue(null);
    mockGetProfileByUserId.mockResolvedValue(null);

    const res2 = await GET(makeRequest(VALID_UUID));
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.data.user.displayName).toBe("Alice");
  });
});
