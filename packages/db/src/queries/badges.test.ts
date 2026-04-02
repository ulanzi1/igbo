// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock("../index", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    delete: mockDelete,
  },
}));

vi.mock("../schema/community-badges", () => ({
  communityUserBadges: {
    userId: "user_id",
    badgeType: "badge_type",
    assignedBy: "assigned_by",
    assignedAt: "assigned_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
}));

import {
  getUserBadge,
  upsertUserBadge,
  deleteUserBadge,
  getUserBadgeWithCache,
  invalidateBadgeCache,
} from "./badges";

const makeRedisMock = (getReturn: string | null = null) => ({
  get: vi.fn().mockResolvedValue(getReturn),
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getUserBadge ─────────────────────────────────────────────────────────────

describe("getUserBadge", () => {
  it("1. returns null for unknown user", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserBadge("unknown-user");

    expect(result).toBeNull();
  });

  it("2. returns badge data for existing badge", async () => {
    const row = { badgeType: "blue" as const, assignedAt: new Date("2026-01-01") };
    const mockLimit = vi.fn().mockResolvedValue([row]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserBadge("user-1");

    expect(result).toEqual(row);
  });
});

// ─── upsertUserBadge ──────────────────────────────────────────────────────────

describe("upsertUserBadge", () => {
  it("3. inserts new badge", async () => {
    const mockOnConflict = vi.fn().mockResolvedValue([]);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    mockInsert.mockReturnValue({ values: mockValues });

    await upsertUserBadge("user-1", "blue", "admin-1");

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", badgeType: "blue", assignedBy: "admin-1" }),
    );
  });

  it("4. upgrades existing badge via ON CONFLICT", async () => {
    const mockOnConflict = vi.fn().mockResolvedValue([]);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    mockInsert.mockReturnValue({ values: mockValues });

    await upsertUserBadge("user-1", "purple", "admin-1");

    expect(mockOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining({ badgeType: "purple" }) }),
    );
  });
});

// ─── deleteUserBadge ──────────────────────────────────────────────────────────

describe("deleteUserBadge", () => {
  it("5. removes existing badge and returns true", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ userId: "user-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });

    const result = await deleteUserBadge("user-1");

    expect(result).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("6. returns false for unknown user (0 rows affected)", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });

    const result = await deleteUserBadge("nonexistent-user");

    expect(result).toBe(false);
  });
});

// ─── getUserBadgeWithCache ─────────────────────────────────────────────────────

describe("getUserBadgeWithCache", () => {
  it("7. reads from cache on hit and returns assignedAt as Date", async () => {
    const cached = JSON.stringify({ badgeType: "red", assignedAt: "2026-01-01T00:00:00.000Z" });
    const redis = makeRedisMock(cached);

    const result = await getUserBadgeWithCache("user-1", redis as never);

    expect(result).toEqual({ badgeType: "red", assignedAt: new Date("2026-01-01T00:00:00.000Z") });
    expect(result?.assignedAt).toBeInstanceOf(Date);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("8. falls back to DB and caches on miss", async () => {
    const redis = makeRedisMock(null);
    const row = { badgeType: "blue" as const, assignedAt: new Date("2026-01-01") };
    const mockLimit = vi.fn().mockResolvedValue([row]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserBadgeWithCache("user-1", redis as never);

    expect(result).toEqual(row);
    expect(redis.set).toHaveBeenCalledWith("badge:user:user-1", JSON.stringify(row), "EX", 300);
  });

  it("9. caches null result from DB (thundering herd prevention)", async () => {
    const redis = makeRedisMock(null);
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserBadgeWithCache("user-no-badge", redis as never);

    expect(result).toBeNull();
    expect(redis.set).toHaveBeenCalledWith("badge:user:user-no-badge", "null", "EX", 300);
  });
});

// ─── invalidateBadgeCache ─────────────────────────────────────────────────────

describe("invalidateBadgeCache", () => {
  it("10. deletes the cache key for the user", async () => {
    const redis = makeRedisMock();

    await invalidateBadgeCache("user-1", redis as never);

    expect(redis.del).toHaveBeenCalledWith("badge:user:user-1");
  });
});
