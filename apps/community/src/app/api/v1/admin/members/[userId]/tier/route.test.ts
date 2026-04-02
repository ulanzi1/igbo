// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAdminSession = vi.fn();
const mockChangeMemberTier = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@/services/tier-service", () => ({
  changeMemberTier: (...args: unknown[]) => mockChangeMemberTier(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { PATCH } from "./route";

const ADMIN_ID = "admin-uuid-1";
const USER_ID = "user-uuid-1";

function makePatchRequest(userId: string, body: unknown) {
  return new Request(`https://example.com/api/v1/admin/members/${userId}/tier`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockChangeMemberTier.mockResolvedValue(undefined);
});

describe("PATCH /api/v1/admin/members/[id]/tier", () => {
  it("returns 200 on valid tier change", async () => {
    const req = makePatchRequest(USER_ID, { tier: "PROFESSIONAL" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.tier).toBe("PROFESSIONAL");
  });

  it("calls changeMemberTier with correct params", async () => {
    const req = makePatchRequest(USER_ID, { tier: "TOP_TIER" });
    await PATCH(req);
    expect(mockChangeMemberTier).toHaveBeenCalledWith(USER_ID, "TOP_TIER", ADMIN_ID);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const req = makePatchRequest(USER_ID, { tier: "PROFESSIONAL" });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const req = makePatchRequest(USER_ID, { tier: "PROFESSIONAL" });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid tier value", async () => {
    const req = makePatchRequest(USER_ID, { tier: "INVALID_TIER" });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing tier in body", async () => {
    const req = makePatchRequest(USER_ID, {});
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when user does not exist", async () => {
    mockChangeMemberTier.mockRejectedValue(new Error("User not found: non-existent-id"));
    const req = makePatchRequest("non-existent-id", { tier: "PROFESSIONAL" });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });
});
