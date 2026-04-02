// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB Mock ────────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../index", () => ({ db: mockDb }));

vi.mock("../schema/community-connections", () => ({
  communityMemberFollows: {
    followerId: "follower_id",
    followingId: "following_id",
    createdAt: "created_at",
  },
}));

vi.mock("../schema/community-profiles", () => ({
  communityProfiles: {
    userId: "user_id",
    displayName: "display_name",
    photoUrl: "photo_url",
    locationCity: "location_city",
    locationCountry: "location_country",
    followerCount: "follower_count",
    followingCount: "following_count",
    deletedAt: "deleted_at",
  },
}));

import {
  followMember,
  unfollowMember,
  isFollowing,
  batchIsFollowing,
  getFollowersPage,
  getFollowingPage,
} from "./follows";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";

function chainable(returnValue: unknown) {
  const resolved = Promise.resolve(returnValue);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  ["from", "innerJoin", "where", "orderBy", "values", "set"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["limit"] = vi.fn().mockResolvedValue(returnValue);
  chain["returning"] = vi.fn().mockResolvedValue(returnValue);
  chain["onConflictDoNothing"] = vi.fn().mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── followMember ─────────────────────────────────────────────────────────────

describe("followMember", () => {
  it("inserts row and increments both counts in a transaction", async () => {
    const txChain = chainable([{ followerId: USER_A }]);
    const txUpdate = chainable([]);

    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue(txChain),
        update: vi.fn().mockReturnValue(txUpdate),
      };
      return cb(tx as unknown as typeof mockDb);
    });

    await followMember(USER_A, USER_B);

    expect(mockDb.transaction).toHaveBeenCalled();
  });

  it("is idempotent — duplicate call does NOT increment counts", async () => {
    // onConflictDoNothing returns empty array (no row inserted)
    const txChainEmpty = chainable([]);
    const txUpdate = chainable([]);
    const mockTxInsert = vi.fn().mockReturnValue(txChainEmpty);
    const mockTxUpdate = vi.fn().mockReturnValue(txUpdate);

    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      const tx = {
        insert: mockTxInsert,
        update: mockTxUpdate,
      };
      return cb(tx as unknown as typeof mockDb);
    });

    await followMember(USER_A, USER_B);

    expect(mockTxInsert).toHaveBeenCalled();
    // update should NOT be called since inserted.length === 0
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});

// ─── unfollowMember ───────────────────────────────────────────────────────────

describe("unfollowMember", () => {
  it("deletes row and decrements both counts in a transaction", async () => {
    const txChainDeleted = chainable([{ followerId: USER_A }]);
    const txUpdate = chainable([]);
    const mockTxDelete = vi.fn().mockReturnValue(txChainDeleted);
    const mockTxUpdate = vi.fn().mockReturnValue(txUpdate);

    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      const tx = {
        delete: mockTxDelete,
        update: mockTxUpdate,
      };
      return cb(tx as unknown as typeof mockDb);
    });

    await unfollowMember(USER_A, USER_B);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTxDelete).toHaveBeenCalled();
    expect(mockTxUpdate).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — non-existent follow does NOT decrement counts", async () => {
    const txChainEmpty = chainable([]);
    const txUpdate = chainable([]);
    const mockTxDelete = vi.fn().mockReturnValue(txChainEmpty);
    const mockTxUpdate = vi.fn().mockReturnValue(txUpdate);

    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      const tx = {
        delete: mockTxDelete,
        update: mockTxUpdate,
      };
      return cb(tx as unknown as typeof mockDb);
    });

    await unfollowMember(USER_A, USER_B);

    expect(mockTxDelete).toHaveBeenCalled();
    // update should NOT be called since deleted.length === 0
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});

// ─── isFollowing ──────────────────────────────────────────────────────────────

describe("isFollowing", () => {
  it("returns true when follow relationship exists", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ followerId: USER_A }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    const result = await isFollowing(USER_A, USER_B);

    expect(result).toBe(true);
  });

  it("returns false when no relationship exists", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    const result = await isFollowing(USER_A, USER_B);

    expect(result).toBe(false);
  });
});

// ─── batchIsFollowing ─────────────────────────────────────────────────────────

describe("batchIsFollowing", () => {
  const USER_C = "00000000-0000-4000-8000-000000000003";

  it("returns empty object when followingIds is empty", async () => {
    const result = await batchIsFollowing(USER_A, []);
    expect(result).toEqual({});
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns true for followed users and false for others", async () => {
    // Simulate: USER_A follows USER_B, not USER_C
    const mockWhere = vi.fn().mockResolvedValue([{ followingId: USER_B }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    const result = await batchIsFollowing(USER_A, [USER_B, USER_C]);

    expect(result).toEqual({ [USER_B]: true, [USER_C]: false });
  });

  it("returns all false when viewer follows none", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    const result = await batchIsFollowing(USER_A, [USER_B, USER_C]);

    expect(result).toEqual({ [USER_B]: false, [USER_C]: false });
  });

  it("returns all true when viewer follows everyone in the batch", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ followingId: USER_B }, { followingId: USER_C }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    const result = await batchIsFollowing(USER_A, [USER_B, USER_C]);

    expect(result).toEqual({ [USER_B]: true, [USER_C]: true });
  });
});

// ─── getFollowersPage ─────────────────────────────────────────────────────────

describe("getFollowersPage", () => {
  const followerRow = {
    userId: USER_A,
    displayName: "Alice",
    photoUrl: null,
    locationCity: "Lagos",
    locationCountry: "Nigeria",
    followedAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("returns paginated followers ordered by createdAt DESC", async () => {
    const chain = chainable([followerRow]);
    mockDb.select.mockReturnValue(chain);

    const result = await getFollowersPage(USER_B);

    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe(USER_A);
    expect(result[0]?.followedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result[0]?.locationCity).toBe("Lagos");
    expect(result[0]?.locationCountry).toBe("Nigeria");
  });

  it("respects cursor for next-page queries", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);

    const result = await getFollowersPage(USER_B, "2026-01-01T00:00:00.000Z");

    expect(result).toHaveLength(0);
    expect(mockDb.select).toHaveBeenCalled();
  });
});

// ─── getFollowingPage ─────────────────────────────────────────────────────────

describe("getFollowingPage", () => {
  const followingRow = {
    userId: USER_B,
    displayName: "Bob",
    photoUrl: "https://example.com/photo.jpg",
    locationCity: null,
    locationCountry: "UK",
    followedAt: new Date("2026-02-01T00:00:00Z"),
  };

  it("returns paginated following ordered by createdAt DESC", async () => {
    const chain = chainable([followingRow]);
    mockDb.select.mockReturnValue(chain);

    const result = await getFollowingPage(USER_A);

    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe(USER_B);
    expect(result[0]?.followedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(result[0]?.photoUrl).toBe("https://example.com/photo.jpg");
    expect(result[0]?.locationCity).toBeNull();
    expect(result[0]?.locationCountry).toBe("UK");
  });
});
