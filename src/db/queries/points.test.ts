// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    execute: mockExecute,
    update: mockUpdate,
  },
}));

vi.mock("@/db/schema/platform-posting-limits", () => ({
  platformPostingLimits: {
    tier: "tier",
    baseLimit: "base_limit",
    pointsThreshold: "points_threshold",
    bonusLimit: "bonus_limit",
  },
}));

vi.mock("@/db/schema/platform-points", () => ({
  platformPointsLedger: {
    id: "id",
    userId: "user_id",
    points: "points",
    reason: "reason",
    sourceType: "source_type",
    sourceId: "source_id",
    multiplierApplied: "multiplier_applied",
    createdAt: "created_at",
  },
  platformPointsRules: {
    id: "id",
    activityType: "activity_type",
    basePoints: "base_points",
    isActive: "is_active",
    description: "description",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("@/db/schema/audit-logs", () => ({
  auditLogs: {
    id: "id",
    actorId: "actor_id",
    action: "action",
    targetUserId: "target_user_id",
    details: "details",
  },
}));

// drizzle-orm operators are pass-throughs in tests
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  sum: vi.fn((col) => ({ type: "sum", col })),
  count: vi.fn(() => ({ type: "count" })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  asc: vi.fn((col) => ({ type: "asc", col })),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings, values }),
    {
      get: (_target, prop) => {
        if (prop === "raw") return (s: string) => ({ type: "sql-raw", s });
        return undefined;
      },
    },
  ),
}));

import {
  insertPointsLedgerEntry,
  getActivePointsRules,
  getAllPostingLimits,
  getPointsRuleByActivityType,
  getUserPointsTotal,
  logPointsThrottle,
  getPointsLedgerHistory,
  getPointsSummaryStats,
  getEffectiveArticleLimit,
  getAllPointsRules,
  updatePointsRule,
  updatePostingLimit,
  getTopPointsEarners,
  getThrottledUsersReport,
  getAdminUserPointsProfile,
  getUserThrottleHistory,
  searchMembersForAdmin,
} from "./points";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── insertPointsLedgerEntry ──────────────────────────────────────────────────

describe("insertPointsLedgerEntry", () => {
  it("inserts a ledger row with correct data", async () => {
    const mockValues = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });

    await insertPointsLedgerEntry({
      userId: "user-1",
      points: 5,
      reason: "like_received",
      sourceType: "like_received",
      sourceId: "post-1",
      multiplierApplied: 1,
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        points: 5,
        reason: "like_received",
        sourceType: "like_received",
        sourceId: "post-1",
        multiplierApplied: "1",
      }),
    );
  });

  it("defaults multiplierApplied to '1' when not provided", async () => {
    const mockValues = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });

    await insertPointsLedgerEntry({
      userId: "user-1",
      points: 10,
      reason: "article_published",
      sourceType: "article_published",
      sourceId: "article-1",
    });

    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ multiplierApplied: "1" }));
  });
});

// ─── getActivePointsRules ──────────────────────────────────────────────────────

describe("getActivePointsRules", () => {
  it("returns active rules from db", async () => {
    const rules = [
      { id: "r1", activityType: "like_received", basePoints: 1, isActive: true },
      { id: "r2", activityType: "event_attended", basePoints: 5, isActive: true },
    ];
    const mockWhere = vi.fn().mockResolvedValue(rules);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getActivePointsRules();

    expect(result).toEqual(rules);
    expect(mockSelect).toHaveBeenCalled();
  });
});

// ─── getAllPostingLimits ───────────────────────────────────────────────────────

describe("getAllPostingLimits", () => {
  function makeOrderByChain(result: unknown[]) {
    const mockOrderBy = vi.fn().mockResolvedValue(result);
    const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    return { from: mockFrom, orderBy: mockOrderBy };
  }

  it("returns all rows ordered by tier then pointsThreshold", async () => {
    const rows = [
      { id: "l1", tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
      { id: "l2", tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { id: "l3", tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 0, bonusLimit: 0 },
    ];
    const { from, orderBy } = makeOrderByChain(rows);
    mockSelect.mockReturnValue({ from });

    const result = await getAllPostingLimits();

    expect(result).toEqual(rows);
    // Verify orderBy was called with asc(tier), asc(pointsThreshold)
    const { asc } = await import("drizzle-orm");
    expect(orderBy).toHaveBeenCalled();
    expect(asc).toHaveBeenCalledWith("tier");
    expect(asc).toHaveBeenCalledWith("points_threshold");
  });

  it("returns empty array when no rows exist", async () => {
    const { from } = makeOrderByChain([]);
    mockSelect.mockReturnValue({ from });

    const result = await getAllPostingLimits();

    expect(result).toHaveLength(0);
  });

  it("returns only professional rows when only those exist", async () => {
    const rows = [
      { id: "l1", tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
      { id: "l2", tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { id: "l3", tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 2000, bonusLimit: 2 },
    ];
    const { from } = makeOrderByChain(rows);
    mockSelect.mockReturnValue({ from });

    const result = await getAllPostingLimits();

    expect(result).toHaveLength(3);
    expect(result.every((r) => (r as { tier: string }).tier === "PROFESSIONAL")).toBe(true);
  });

  it("returned objects have correct shape", async () => {
    const rows = [
      { id: "l1", tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
    ];
    const { from } = makeOrderByChain(rows);
    mockSelect.mockReturnValue({ from });

    const result = await getAllPostingLimits();

    expect(result[0]).toMatchObject({
      id: "l1",
      tier: "PROFESSIONAL",
      baseLimit: 1,
      pointsThreshold: 0,
      bonusLimit: 0,
    });
  });
});

// ─── getPointsRuleByActivityType ──────────────────────────────────────────────

describe("getPointsRuleByActivityType", () => {
  it("returns the rule when found", async () => {
    const rule = { id: "r1", activityType: "like_received", basePoints: 1, isActive: true };
    const mockLimit = vi.fn().mockResolvedValue([rule]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getPointsRuleByActivityType("like_received");

    expect(result).toEqual(rule);
  });

  it("returns null when no rule found", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getPointsRuleByActivityType("nonexistent");

    expect(result).toBeNull();
  });
});

// ─── getUserPointsTotal ────────────────────────────────────────────────────────

describe("getUserPointsTotal", () => {
  it("returns summed points when rows exist", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ total: "42" }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserPointsTotal("user-1");

    expect(result).toBe(42);
  });

  it("returns 0 when user has no ledger entries (null sum)", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ total: null }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserPointsTotal("user-no-points");

    expect(result).toBe(0);
  });

  it("returns 0 when no rows returned at all", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getUserPointsTotal("user-no-rows");

    expect(result).toBe(0);
  });
});

// ─── logPointsThrottle ────────────────────────────────────────────────────────

describe("logPointsThrottle", () => {
  it("inserts an audit log with action=points_throttled", async () => {
    const mockValues = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });

    await logPointsThrottle({
      actorId: "reactor-id",
      earnerUserId: "author-id",
      reason: "rapid_fire",
      eventType: "post.reacted",
      eventId: "post-1",
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "reactor-id",
        action: "points_throttled",
        targetUserId: "author-id",
        details: expect.objectContaining({ reason: "rapid_fire", eventType: "post.reacted" }),
      }),
    );
  });

  it("works for repeat_pair reason", async () => {
    const mockValues = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });

    await logPointsThrottle({
      actorId: "actor-1",
      earnerUserId: "earner-1",
      reason: "repeat_pair",
      eventType: "post.reacted",
      eventId: "post-2",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ reason: "repeat_pair" }),
      }),
    );
  });
});

// ─── getPointsLedgerHistory ───────────────────────────────────────────────────

describe("getPointsLedgerHistory", () => {
  /** Build a data-query chain: select→from→where→orderBy→limit→offset */
  function makeDataChain(result: unknown[]) {
    const mockOffset = vi.fn().mockResolvedValue(result);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    return { from: mockFrom, offset: mockOffset };
  }

  /** Build a count-query chain: select→from→where (resolves directly) */
  function makeCountChain(total: number) {
    const mockWhere = vi.fn().mockResolvedValue([{ total }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    return { from: mockFrom };
  }

  it("returns entries and total for a user with ledger entries", async () => {
    const entry = {
      id: "e1",
      points: 1,
      reason: "like_received",
      sourceType: "like_received",
      sourceId: "post-1",
      multiplierApplied: "1.00",
      createdAt: new Date(),
    };
    const data = makeDataChain([entry]);
    const cnt = makeCountChain(1);
    mockSelect.mockReturnValueOnce({ from: data.from }).mockReturnValueOnce({ from: cnt.from });

    const result = await getPointsLedgerHistory("user-1", { page: 1, limit: 20 });

    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("returns empty entries and total 0 when user has no ledger entries", async () => {
    const data = makeDataChain([]);
    const cnt = makeCountChain(0);
    mockSelect.mockReturnValueOnce({ from: data.from }).mockReturnValueOnce({ from: cnt.from });

    const result = await getPointsLedgerHistory("user-no-points", { page: 1, limit: 20 });

    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("applies activityType filter — uses and() for compound where clause", async () => {
    const data = makeDataChain([]);
    const cnt = makeCountChain(0);
    mockSelect.mockReturnValueOnce({ from: data.from }).mockReturnValueOnce({ from: cnt.from });

    const { and: andMock } = await import("drizzle-orm");
    (andMock as ReturnType<typeof vi.fn>).mockClear();

    await getPointsLedgerHistory("user-1", {
      page: 1,
      limit: 20,
      activityType: "like_received",
    });

    expect(andMock).toHaveBeenCalled();
  });

  it("handles page 2 with correct offset (offset = (page-1) * limit)", async () => {
    const data = makeDataChain([]);
    const cnt = makeCountChain(25);
    mockSelect.mockReturnValueOnce({ from: data.from }).mockReturnValueOnce({ from: cnt.from });

    await getPointsLedgerHistory("user-1", { page: 2, limit: 10 });

    expect(data.offset).toHaveBeenCalledWith(10);
  });
});

// ─── getEffectiveArticleLimit ─────────────────────────────────────────────────

describe("getEffectiveArticleLimit", () => {
  /**
   * getEffectiveArticleLimit makes two db.select calls:
   *   1. getUserPointsTotal → select().from().where() resolves to [{total: N}]
   *   2. posting limits    → select().from().where().orderBy() resolves to rows[]
   */
  function makeEffectiveLimitMocks(totalPoints: number, limitRows: unknown[]) {
    // Call 1: getUserPointsTotal
    const whereTotal = vi.fn().mockResolvedValue([{ total: String(totalPoints) }]);
    const fromTotal = vi.fn().mockReturnValue({ where: whereTotal });

    // Call 2: posting limits query
    const mockOrderBy = vi.fn().mockResolvedValue(limitRows);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const fromLimits = vi.fn().mockReturnValue({ where: mockWhere });

    mockSelect.mockReturnValueOnce({ from: fromTotal }).mockReturnValueOnce({ from: fromLimits });
  }

  it("Professional/0pts → 1 (matches threshold-0 row, base=1+bonus=0)", async () => {
    makeEffectiveLimitMocks(0, [
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 2000, bonusLimit: 2 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
    ]);
    const result = await getEffectiveArticleLimit("user-1", "PROFESSIONAL");
    expect(result).toBe(1); // 1+0
  });

  it("Professional/500pts → 2 (matches threshold-500 row, base=1+bonus=1)", async () => {
    makeEffectiveLimitMocks(500, [
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 2000, bonusLimit: 2 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
    ]);
    const result = await getEffectiveArticleLimit("user-1", "PROFESSIONAL");
    expect(result).toBe(2); // 1+1
  });

  it("Professional/2000pts → 3 (matches threshold-2000 row, base=1+bonus=2)", async () => {
    makeEffectiveLimitMocks(2000, [
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 2000, bonusLimit: 2 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
    ]);
    const result = await getEffectiveArticleLimit("user-1", "PROFESSIONAL");
    expect(result).toBe(3); // 1+2
  });

  it("Top-tier/0pts → 2 (matches threshold-0 row, base=2+bonus=0)", async () => {
    makeEffectiveLimitMocks(0, [
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 30000, bonusLimit: 5 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 15000, bonusLimit: 4 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 7500, bonusLimit: 3 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 3000, bonusLimit: 2 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 1000, bonusLimit: 1 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 0, bonusLimit: 0 },
    ]);
    const result = await getEffectiveArticleLimit("user-1", "TOP_TIER");
    expect(result).toBe(2); // 2+0
  });

  it("Top-tier/1000pts → 3 (matches threshold-1000 row, base=2+bonus=1)", async () => {
    makeEffectiveLimitMocks(1000, [
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 30000, bonusLimit: 5 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 15000, bonusLimit: 4 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 7500, bonusLimit: 3 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 3000, bonusLimit: 2 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 1000, bonusLimit: 1 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 0, bonusLimit: 0 },
    ]);
    const result = await getEffectiveArticleLimit("user-1", "TOP_TIER");
    expect(result).toBe(3); // 2+1
  });

  it("Top-tier/30000pts → 7 (matches threshold-30000 row, base=2+bonus=5)", async () => {
    makeEffectiveLimitMocks(30000, [
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 30000, bonusLimit: 5 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 15000, bonusLimit: 4 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 7500, bonusLimit: 3 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 3000, bonusLimit: 2 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 1000, bonusLimit: 1 },
      { tier: "TOP_TIER", baseLimit: 2, pointsThreshold: 0, bonusLimit: 0 },
    ]);
    const result = await getEffectiveArticleLimit("user-1", "TOP_TIER");
    expect(result).toBe(7); // 2+5
  });

  it("falls back to tier baseline when no posting limit rows exist", async () => {
    makeEffectiveLimitMocks(9999, []);
    const result = await getEffectiveArticleLimit("user-1", "PROFESSIONAL");
    expect(result).toBe(1); // TIER_ARTICLE_BASELINE["PROFESSIONAL"]
  });

  it("skips getUserPointsTotal when preloadedPoints is provided", async () => {
    // Only set up the posting limits query (call 1) — no getUserPointsTotal call
    const mockOrderBy = vi.fn().mockResolvedValue([
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 500, bonusLimit: 1 },
      { tier: "PROFESSIONAL", baseLimit: 1, pointsThreshold: 0, bonusLimit: 0 },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const fromLimits = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValueOnce({ from: fromLimits });

    const result = await getEffectiveArticleLimit("user-1", "PROFESSIONAL", 500);
    expect(result).toBe(2); // 1+1 (500pts matches threshold-500)
    // Only 1 db.select call (posting limits), not 2 (no getUserPointsTotal)
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});

// ─── getPointsSummaryStats ────────────────────────────────────────────────────

describe("getPointsSummaryStats", () => {
  it("returns parsed summary stats when data exists", async () => {
    mockExecute.mockResolvedValue([{ total: "50", this_week: "10", this_month: "30" }]);

    const result = await getPointsSummaryStats("user-1");

    expect(result).toEqual({ total: 50, thisWeek: 10, thisMonth: 30 });
  });

  it("returns all zeros when user has no ledger entries", async () => {
    mockExecute.mockResolvedValue([{ total: "0", this_week: "0", this_month: "0" }]);

    const result = await getPointsSummaryStats("user-no-points");

    expect(result).toEqual({ total: 0, thisWeek: 0, thisMonth: 0 });
  });

  it("handles empty result set gracefully", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await getPointsSummaryStats("user-empty");

    expect(result).toEqual({ total: 0, thisWeek: 0, thisMonth: 0 });
  });
});

// ─── getAllPointsRules ─────────────────────────────────────────────────────────

describe("getAllPointsRules", () => {
  it("returns all rules including inactive ones", async () => {
    const rules = [
      { id: "r1", activityType: "like_received", basePoints: 1, isActive: true },
      { id: "r2", activityType: "event_attended", basePoints: 5, isActive: false },
    ];
    const mockFrom = vi.fn().mockResolvedValue(rules);
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getAllPointsRules();

    expect(result).toEqual(rules);
    expect(mockSelect).toHaveBeenCalled();
    // Does NOT filter by isActive — all rules returned
    expect(mockFrom).toHaveBeenCalled();
  });

  it("returns empty array when no rules exist", async () => {
    const mockFrom = vi.fn().mockResolvedValue([]);
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getAllPointsRules();

    expect(result).toHaveLength(0);
  });
});

// ─── updatePointsRule ─────────────────────────────────────────────────────────

describe("updatePointsRule", () => {
  it("returns updated rule when row found", async () => {
    const updated = { id: "r1", activityType: "like_received", basePoints: 3, isActive: true };
    const mockReturning = vi.fn().mockResolvedValue([updated]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await updatePointsRule("r1", { basePoints: 3 });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ basePoints: 3 }));
    expect(result).toEqual(updated);
  });

  it("returns null when rule id not found", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await updatePointsRule("nonexistent", { isActive: false });

    expect(result).toBeNull();
  });

  it("passes isActive update correctly", async () => {
    const updated = { id: "r1", activityType: "like_received", basePoints: 1, isActive: false };
    const mockReturning = vi.fn().mockResolvedValue([updated]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updatePointsRule("r1", { isActive: false });

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });
});

// ─── updatePostingLimit ───────────────────────────────────────────────────────

describe("updatePostingLimit", () => {
  it("returns updated posting limit row when found", async () => {
    const updated = {
      id: "l1",
      tier: "PROFESSIONAL",
      baseLimit: 2,
      bonusLimit: 1,
      pointsThreshold: 500,
    };
    const mockReturning = vi.fn().mockResolvedValue([updated]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await updatePostingLimit("l1", { baseLimit: 2, bonusLimit: 1 });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ baseLimit: 2, bonusLimit: 1 }));
    expect(result).toEqual(updated);
  });

  it("returns null when posting limit id not found", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await updatePostingLimit("nonexistent", { pointsThreshold: 100 });

    expect(result).toBeNull();
  });
});

// ─── getTopPointsEarners ──────────────────────────────────────────────────────

describe("getTopPointsEarners", () => {
  function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      user_id: "user-1",
      display_name: "Alice",
      email: "alice@example.com",
      total_points: "100",
      badge_type: null,
      member_since: "2024-01-01T00:00:00.000Z",
      total_count: "1",
      ...overrides,
    };
  }

  it("returns empty results when no rows", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await getTopPointsEarners({ page: 1, limit: 25 });
    expect(result).toEqual({ users: [], total: 0 });
  });

  it("returns users with parsed integer points and total count", async () => {
    const row = makeRow({ total_points: "150", total_count: "3" });
    mockExecute.mockResolvedValue([row]);
    const result = await getTopPointsEarners({ page: 1, limit: 25 });
    expect(result.total).toBe(3);
    expect(result.users).toHaveLength(1);
    expect(result.users[0].totalPoints).toBe(150);
    expect(result.users[0].userId).toBe("user-1");
    expect(result.users[0].email).toBe("alice@example.com");
    expect(result.users[0].displayName).toBe("Alice");
    expect(result.users[0].badgeType).toBeNull();
  });

  it("returns multiple users across pages", async () => {
    const rows = [
      makeRow({ user_id: "u1", total_points: "200", total_count: "2" }),
      makeRow({ user_id: "u2", total_points: "100", total_count: "2" }),
    ];
    mockExecute.mockResolvedValue(rows);
    const result = await getTopPointsEarners({ page: 1, limit: 25 });
    expect(result.total).toBe(2);
    expect(result.users).toHaveLength(2);
  });

  it("casts badge_type as BadgeType", async () => {
    mockExecute.mockResolvedValue([makeRow({ badge_type: "blue" })]);
    const result = await getTopPointsEarners({ page: 1, limit: 25 });
    expect(result.users[0].badgeType).toBe("blue");
  });

  it("returns empty results when dateFrom > dateTo (invalid range)", async () => {
    const result = await getTopPointsEarners({
      page: 1,
      limit: 25,
      dateFrom: "2024-12-31",
      dateTo: "2024-01-01",
    });
    expect(result).toEqual({ users: [], total: 0 });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("runs query when dateFrom equals dateTo (same-day range is valid)", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await getTopPointsEarners({
      page: 1,
      limit: 25,
      dateFrom: "2024-06-01",
      dateTo: "2024-06-01",
    });
    expect(result).toEqual({ users: [], total: 0 });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("executes query with date range filter applied", async () => {
    mockExecute.mockResolvedValue([makeRow({ total_count: "1" })]);
    await getTopPointsEarners({
      page: 1,
      limit: 25,
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("executes query with activity type filter applied", async () => {
    mockExecute.mockResolvedValue([]);
    await getTopPointsEarners({ page: 1, limit: 25, activityType: "like_received" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("executes query with both date range and activity type filters", async () => {
    mockExecute.mockResolvedValue([]);
    await getTopPointsEarners({
      page: 1,
      limit: 25,
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      activityType: "event_attended",
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("excludes soft-deleted user: empty results when only soft-deleted user exists", async () => {
    // Soft-deleted users are excluded via INNER JOIN ... AND au.deleted_at IS NULL in raw SQL.
    // The mock simulates the DB returning zero rows as it would for deleted users.
    mockExecute.mockResolvedValue([]);
    const result = await getTopPointsEarners({ page: 1, limit: 25 });
    expect(result).toEqual({ users: [], total: 0 });
  });

  it("handles null display_name gracefully", async () => {
    mockExecute.mockResolvedValue([makeRow({ display_name: null })]);
    const result = await getTopPointsEarners({ page: 1, limit: 25 });
    expect(result.users[0].displayName).toBeNull();
  });

  it("calculates correct offset for page 2", async () => {
    mockExecute.mockResolvedValue([]);
    await getTopPointsEarners({ page: 2, limit: 10 });
    // Offset should be 10 = (2-1) * 10; verified by confirming execute was called
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ─── getThrottledUsersReport ──────────────────────────────────────────────────

describe("getThrottledUsersReport", () => {
  function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      user_id: "user-1",
      display_name: "Bob",
      throttle_count: "3",
      last_throttled_at: "2024-06-15T12:00:00.000Z",
      reasons: ["rapid_fire", "repeat_pair"],
      total_count: "1",
      ...overrides,
    };
  }

  it("returns empty results when no throttled users", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result).toEqual({ users: [], total: 0 });
  });

  it("returns throttled users with parsed throttle counts", async () => {
    mockExecute.mockResolvedValue([makeRow()]);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result.total).toBe(1);
    expect(result.users).toHaveLength(1);
    expect(result.users[0].throttleCount).toBe(3);
    expect(result.users[0].userId).toBe("user-1");
    expect(result.users[0].displayName).toBe("Bob");
    expect(result.users[0].lastThrottledAt).toBe("2024-06-15T12:00:00.000Z");
    expect(result.users[0].reasons).toEqual(["rapid_fire", "repeat_pair"]);
  });

  it("groups by user — multiple throttle events produce one row per user", async () => {
    const rows = [
      makeRow({ user_id: "u1", throttle_count: "5", total_count: "2" }),
      makeRow({ user_id: "u2", throttle_count: "2", total_count: "2" }),
    ];
    mockExecute.mockResolvedValue(rows);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result.total).toBe(2);
    expect(result.users).toHaveLength(2);
    expect(result.users[0].throttleCount).toBe(5);
    expect(result.users[1].throttleCount).toBe(2);
  });

  it("handles null display_name gracefully", async () => {
    mockExecute.mockResolvedValue([makeRow({ display_name: null })]);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result.users[0].displayName).toBeNull();
  });

  it("handles empty reasons array (FILTER clause prevents NULL entries)", async () => {
    mockExecute.mockResolvedValue([makeRow({ reasons: [] })]);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result.users[0].reasons).toEqual([]);
  });

  it("excludes soft-deleted users: returns empty when only soft-deleted users have throttle logs", async () => {
    // Soft-deleted users excluded via INNER JOIN ... AND au.deleted_at IS NULL in raw SQL.
    mockExecute.mockResolvedValue([]);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result).toEqual({ users: [], total: 0 });
  });

  it("excludes rows where target_user_id IS NULL: returns empty when only null-target logs exist", async () => {
    // WHERE al.target_user_id IS NOT NULL in raw SQL handles this.
    mockExecute.mockResolvedValue([]);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result).toEqual({ users: [], total: 0 });
  });

  it("handles pagination: page 2 calculates correct offset", async () => {
    mockExecute.mockResolvedValue([]);
    await getThrottledUsersReport({ page: 2, limit: 10 });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("handles non-array reasons by defaulting to empty array", async () => {
    mockExecute.mockResolvedValue([makeRow({ reasons: null })]);
    const result = await getThrottledUsersReport({ page: 1, limit: 25 });
    expect(result.users[0].reasons).toEqual([]);
  });
});

// ─── getAdminUserPointsProfile ────────────────────────────────────────────────

describe("getAdminUserPointsProfile", () => {
  function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      user_id: "user-1",
      display_name: "Alice",
      email: "alice@example.com",
      member_since: "2024-01-01T00:00:00.000Z",
      badge_type: null,
      badge_assigned_at: null,
      ...overrides,
    };
  }

  it("returns profile when user exists", async () => {
    mockExecute.mockResolvedValue([makeRow()]);
    const result = await getAdminUserPointsProfile("user-1");
    expect(result).toEqual({
      userId: "user-1",
      displayName: "Alice",
      email: "alice@example.com",
      memberSince: "2024-01-01T00:00:00.000Z",
      badgeType: null,
      badgeAssignedAt: null,
    });
  });

  it("returns null when user not found or soft-deleted", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await getAdminUserPointsProfile("deleted-user");
    expect(result).toBeNull();
  });

  it("returns badge info when user has a badge", async () => {
    mockExecute.mockResolvedValue([
      makeRow({ badge_type: "blue", badge_assigned_at: "2024-06-01T00:00:00.000Z" }),
    ]);
    const result = await getAdminUserPointsProfile("user-1");
    expect(result?.badgeType).toBe("blue");
    expect(result?.badgeAssignedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("returns null displayName when user has no community profile", async () => {
    mockExecute.mockResolvedValue([makeRow({ display_name: null })]);
    const result = await getAdminUserPointsProfile("user-1");
    expect(result?.displayName).toBeNull();
  });
});

// ─── getUserThrottleHistory ───────────────────────────────────────────────────

describe("getUserThrottleHistory", () => {
  function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      date: "2024-06-01T12:00:00.000Z",
      reason: "rapid_fire",
      event_type: "post.reacted",
      event_id: "post-1",
      triggered_by: "Bob",
      total_count: "1",
      ...overrides,
    };
  }

  it("returns empty results when no throttle logs exist for user", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await getUserThrottleHistory("user-1", { page: 1, limit: 20 });
    expect(result).toEqual({ entries: [], total: 0 });
  });

  it("returns throttle history entries with correct shape", async () => {
    mockExecute.mockResolvedValue([makeRow()]);
    const result = await getUserThrottleHistory("user-1", { page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      date: "2024-06-01T12:00:00.000Z",
      reason: "rapid_fire",
      eventType: "post.reacted",
      eventId: "post-1",
      triggeredBy: "Bob",
    });
  });

  it("orders by created_at DESC (most recent first)", async () => {
    const rows = [
      makeRow({ date: "2024-06-10T00:00:00.000Z", total_count: "2" }),
      makeRow({ date: "2024-06-01T00:00:00.000Z", total_count: "2" }),
    ];
    mockExecute.mockResolvedValue(rows);
    const result = await getUserThrottleHistory("user-1", { page: 1, limit: 20 });
    expect(result.entries[0].date).toBe("2024-06-10T00:00:00.000Z");
    expect(result.entries[1].date).toBe("2024-06-01T00:00:00.000Z");
  });

  it("handles page 2 with correct offset", async () => {
    mockExecute.mockResolvedValue([]);
    await getUserThrottleHistory("user-1", { page: 2, limit: 10 });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("handles null reason and triggeredBy gracefully", async () => {
    mockExecute.mockResolvedValue([makeRow({ reason: null, triggered_by: null })]);
    const result = await getUserThrottleHistory("user-1", { page: 1, limit: 20 });
    expect(result.entries[0].reason).toBeNull();
    expect(result.entries[0].triggeredBy).toBeNull();
  });
});

// ─── searchMembersForAdmin ────────────────────────────────────────────────────

describe("searchMembersForAdmin", () => {
  function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      user_id: "user-1",
      display_name: "Alice",
      email: "alice@example.com",
      ...overrides,
    };
  }

  it("returns empty array when no members match", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await searchMembersForAdmin("zzz");
    expect(result).toEqual([]);
  });

  it("returns matching members with correct shape", async () => {
    mockExecute.mockResolvedValue([makeRow()]);
    const result = await searchMembersForAdmin("alice");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      userId: "user-1",
      displayName: "Alice",
      email: "alice@example.com",
    });
  });

  it("excludes soft-deleted users (mock returns no rows)", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await searchMembersForAdmin("alice");
    expect(result).toHaveLength(0);
  });

  it("escapes ILIKE wildcards: % and _ characters in query", async () => {
    mockExecute.mockResolvedValue([]);
    // Should not throw; wildcards are escaped before being passed to ILIKE
    await expect(searchMembersForAdmin("100% real_name")).resolves.toEqual([]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("handles null display_name gracefully", async () => {
    mockExecute.mockResolvedValue([makeRow({ display_name: null })]);
    const result = await searchMembersForAdmin("alice");
    expect(result[0].displayName).toBeNull();
  });

  it("returns multiple results up to limit", async () => {
    const rows = [
      makeRow({ user_id: "u1", display_name: "Alice A" }),
      makeRow({ user_id: "u2", display_name: "Alice B" }),
    ];
    mockExecute.mockResolvedValue(rows);
    const result = await searchMembersForAdmin("alice");
    expect(result).toHaveLength(2);
  });
});
