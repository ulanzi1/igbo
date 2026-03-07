// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    execute: mockExecute,
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
  getPointsRuleByActivityType,
  getUserPointsTotal,
  logPointsThrottle,
  getPointsLedgerHistory,
  getPointsSummaryStats,
  getEffectiveArticleLimit,
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
