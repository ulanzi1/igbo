// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: {
    id: "id",
    membershipTier: "membership_tier",
    deletedAt: "deleted_at",
    accountStatus: "account_status",
    updatedAt: "updated_at",
  },
}));

vi.mock("../schema/auth-permissions", () => ({
  authRoles: { id: "id", name: "name" },
  authUserRoles: { userId: "user_id", roleId: "role_id", id: "id" },
}));

import { getUserMembershipTier, updateUserMembershipTier } from "./auth-permissions";

const USER_ID = "user-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserMembershipTier", () => {
  it("returns user tier from DB", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ membershipTier: "PROFESSIONAL" }]),
        }),
      }),
    });

    const tier = await getUserMembershipTier(USER_ID);
    expect(tier).toBe("PROFESSIONAL");
  });

  it("throws if user not found", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(getUserMembershipTier(USER_ID)).rejects.toThrow(`User not found: ${USER_ID}`);
  });
});

describe("updateUserMembershipTier", () => {
  it("calls db.update with correct values", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateUserMembershipTier(USER_ID, "TOP_TIER", "admin-id");

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ membershipTier: "TOP_TIER" }));
  });
});
