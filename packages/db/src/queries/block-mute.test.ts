// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── DB Mock ────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("../schema/platform-social", () => ({
  platformBlockedUsers: {
    blockerUserId: "blocker_user_id",
    blockedUserId: "blocked_user_id",
    createdAt: "created_at",
  },
  platformMutedUsers: {
    muterUserId: "muter_user_id",
    mutedUserId: "muted_user_id",
    createdAt: "created_at",
  },
}));

import {
  isBlocked,
  blockUser,
  unblockUser,
  getBlockedUserIds,
  isMuted,
  muteUser,
  unmuteUser,
  getUsersWhoBlocked,
  isAnyBlocked,
} from "./block-mute";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── isBlocked ───────────────────────────────────────────────────────────────

describe("isBlocked", () => {
  it("returns true when block relationship exists", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ blockerUserId: USER_A }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await isBlocked(USER_A, USER_B);

    expect(result).toBe(true);
  });

  it("returns false when no block relationship", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await isBlocked(USER_A, USER_B);

    expect(result).toBe(false);
  });
});

// ─── blockUser ───────────────────────────────────────────────────────────────

describe("blockUser", () => {
  it("inserts a block relationship", async () => {
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue([]);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });

    await blockUser(USER_A, USER_B);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({ blockerUserId: USER_A, blockedUserId: USER_B });
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });
});

// ─── unblockUser ─────────────────────────────────────────────────────────────

describe("unblockUser", () => {
  it("deletes a block relationship", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    mockDelete.mockReturnValue({ where: mockWhere });

    await unblockUser(USER_A, USER_B);

    expect(mockDelete).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });
});

// ─── getBlockedUserIds ───────────────────────────────────────────────────────

describe("getBlockedUserIds", () => {
  it("returns list of blocked user IDs", async () => {
    const mockWhere = vi
      .fn()
      .mockResolvedValue([
        { blockedUserId: USER_B },
        { blockedUserId: "00000000-0000-4000-8000-000000000003" },
      ]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const ids = await getBlockedUserIds(USER_A);

    expect(ids).toEqual([USER_B, "00000000-0000-4000-8000-000000000003"]);
  });

  it("returns empty array when no blocks", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const ids = await getBlockedUserIds(USER_A);

    expect(ids).toEqual([]);
  });
});

// ─── isMuted ─────────────────────────────────────────────────────────────────

describe("isMuted", () => {
  it("returns true when mute relationship exists", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ muterUserId: USER_A }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await isMuted(USER_A, USER_B);

    expect(result).toBe(true);
  });

  it("returns false when no mute relationship", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await isMuted(USER_A, USER_B);

    expect(result).toBe(false);
  });
});

// ─── muteUser ────────────────────────────────────────────────────────────────

describe("muteUser", () => {
  it("inserts a mute relationship", async () => {
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue([]);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });

    await muteUser(USER_A, USER_B);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({ muterUserId: USER_A, mutedUserId: USER_B });
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });
});

// ─── unmuteUser ──────────────────────────────────────────────────────────────

describe("unmuteUser", () => {
  it("deletes a mute relationship", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    mockDelete.mockReturnValue({ where: mockWhere });

    await unmuteUser(USER_A, USER_B);

    expect(mockDelete).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });
});

// ─── getUsersWhoBlocked ──────────────────────────────────────────────────────

describe("getUsersWhoBlocked", () => {
  it("returns IDs of users who blocked the target", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ blockerUserId: USER_A }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const ids = await getUsersWhoBlocked(USER_B);

    expect(ids).toEqual([USER_A]);
  });
});

// ─── isAnyBlocked ────────────────────────────────────────────────────────────

describe("isAnyBlocked", () => {
  it("returns false immediately for empty list", async () => {
    const result = await isAnyBlocked(USER_A, []);
    expect(result).toBe(false);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns true when at least one match found", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ blockerUserId: USER_A }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await isAnyBlocked(USER_A, [USER_B]);

    expect(result).toBe(true);
  });

  it("returns false when no matches found", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await isAnyBlocked(USER_A, [USER_B]);

    expect(result).toBe(false);
  });
});
