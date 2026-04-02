// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const mockGetUserMembershipTier = vi.fn();
const mockUpdateUserMembershipTier = vi.fn();
const mockFindActiveSessionsByUserId = vi.fn();
const mockEvictAllUserSessions = vi.fn();
const mockLogAdminAction = vi.fn();
const mockEventBusEmit = vi.fn();

vi.mock("@igbo/db/queries/auth-permissions", () => ({
  getUserMembershipTier: (...args: unknown[]) => mockGetUserMembershipTier(...args),
  updateUserMembershipTier: (...args: unknown[]) => mockUpdateUserMembershipTier(...args),
}));

vi.mock("@igbo/db/queries/auth-sessions", () => ({
  findActiveSessionsByUserId: (...args: unknown[]) => mockFindActiveSessionsByUserId(...args),
}));

vi.mock("@igbo/auth/session-cache", () => ({
  evictAllUserSessions: (...args: unknown[]) => mockEvictAllUserSessions(...args),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: (...args: unknown[]) => mockEventBusEmit(...args) },
}));

import { changeMemberTier, getMemberTier, getDefaultTier } from "./tier-service";

const USER_ID = "user-uuid-1";
const ADMIN_ID = "admin-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateUserMembershipTier.mockResolvedValue(undefined);
  mockFindActiveSessionsByUserId.mockResolvedValue([
    { sessionToken: "token-1" },
    { sessionToken: "token-2" },
  ]);
  mockEvictAllUserSessions.mockResolvedValue(undefined);
  mockLogAdminAction.mockResolvedValue(undefined);
  mockEventBusEmit.mockResolvedValue(undefined);
});

describe("changeMemberTier", () => {
  it("updates tier, evicts sessions, emits event, logs audit on success", async () => {
    mockGetUserMembershipTier.mockResolvedValue("BASIC");

    await changeMemberTier(USER_ID, "PROFESSIONAL", ADMIN_ID);

    expect(mockUpdateUserMembershipTier).toHaveBeenCalledWith(USER_ID, "PROFESSIONAL", ADMIN_ID);
    expect(mockFindActiveSessionsByUserId).toHaveBeenCalledWith(USER_ID);
    expect(mockEvictAllUserSessions).toHaveBeenCalledWith(["token-1", "token-2"]);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.tier_changed",
      expect.objectContaining({
        userId: USER_ID,
        previousTier: "BASIC",
        newTier: "PROFESSIONAL",
        changedBy: ADMIN_ID,
      }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MEMBER_TIER_CHANGED",
        actorId: ADMIN_ID,
        targetUserId: USER_ID,
        details: { previousTier: "BASIC", newTier: "PROFESSIONAL" },
      }),
    );
  });

  it("is a no-op when tier is unchanged", async () => {
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");

    await changeMemberTier(USER_ID, "PROFESSIONAL", ADMIN_ID);

    expect(mockUpdateUserMembershipTier).not.toHaveBeenCalled();
    expect(mockEvictAllUserSessions).not.toHaveBeenCalled();
    expect(mockEventBusEmit).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it("propagates error when getUserMembershipTier throws (user not found)", async () => {
    mockGetUserMembershipTier.mockRejectedValue(new Error("User not found: bad-id"));

    await expect(changeMemberTier("bad-id", "PROFESSIONAL", ADMIN_ID)).rejects.toThrow(
      "User not found",
    );
  });
});

describe("getMemberTier", () => {
  it("delegates to getUserMembershipTier", async () => {
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    const tier = await getMemberTier(USER_ID);
    expect(tier).toBe("TOP_TIER");
    expect(mockGetUserMembershipTier).toHaveBeenCalledWith(USER_ID);
  });
});

describe("getDefaultTier", () => {
  it("returns BASIC", () => {
    expect(getDefaultTier()).toBe("BASIC");
  });
});
