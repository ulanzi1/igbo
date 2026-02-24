// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminSession = vi.fn();
const mockFindUserById = vi.fn();
const mockAdmin2faReset = vi.fn();
const mockLogAdminAction = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));
vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));
vi.mock("@/services/auth-service", () => ({
  admin2faReset: (...args: unknown[]) => mockAdmin2faReset(...args),
}));
vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const ADMIN_ID = "admin-uuid-1";
const TARGET_ID = "user-uuid-2";

function makePostRequest(userId = TARGET_ID) {
  return new Request(`https://example.com/api/v1/admin/members/${userId}/reset-2fa`, {
    method: "POST",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockFindUserById.mockResolvedValue({
    id: TARGET_ID,
    email: "member@example.com",
    accountStatus: "APPROVED",
  });
  mockAdmin2faReset.mockResolvedValue(undefined);
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/members/[id]/reset-2fa", () => {
  it("returns 200 on successful 2FA reset", async () => {
    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toContain("reset successfully");
  });

  it("calls admin2faReset with correct args", async () => {
    await POST(makePostRequest());
    expect(mockAdmin2faReset).toHaveBeenCalledWith(TARGET_ID, ADMIN_ID);
  });

  it("logs admin action", async () => {
    await POST(makePostRequest());
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ADMIN_ID, action: "RESET_2FA", targetUserId: TARGET_ID }),
    );
  });

  it("returns 404 when user not found", async () => {
    mockFindUserById.mockResolvedValue(null);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(404);
  });

  it("returns 409 for non-approved user", async () => {
    mockFindUserById.mockResolvedValue({ id: TARGET_ID, accountStatus: "PENDING_APPROVAL" });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(409);
  });

  it("returns 401 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });
});
