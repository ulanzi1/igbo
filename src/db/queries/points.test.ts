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
}));

import {
  insertPointsLedgerEntry,
  getActivePointsRules,
  getPointsRuleByActivityType,
  getUserPointsTotal,
  logPointsThrottle,
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
