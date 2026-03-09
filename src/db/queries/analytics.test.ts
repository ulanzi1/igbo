// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    execute: mockExecute,
    transaction: mockTransaction,
  },
}));

vi.mock("@/db/schema/platform-analytics-snapshots", () => ({
  platformAnalyticsSnapshots: {
    id: "id",
    metricType: "metric_type",
    metricDate: "metric_date",
    metricValue: "metric_value",
    metadata: "metadata",
    createdAt: "created_at",
  },
  analyticsMetricTypeEnum: { enumValues: [] },
}));

vi.mock("@/db/schema/auth-sessions", () => ({
  authSessions: {
    userId: "user_id",
    expires: "expires",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join("?"), values }),
    { join: vi.fn(() => ({})) },
  ),
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
}));

import {
  upsertSnapshot,
  upsertSnapshotsForDate,
  getSnapshotValue,
  getSnapshotSeries,
  getBreakdownSnapshot,
  getLatestBreakdownSnapshot,
  getSummaryMetrics,
  getGrowthSeries,
  getEngagementMetrics,
  currentlyOnlineUsers,
  todayPartialDau,
} from "./analytics";

describe("upsertSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls insert with onConflictDoUpdate", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockInsert.mockReturnValue({ values });

    await upsertSnapshot("dau", "2026-03-01", 42, null);

    expect(mockInsert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ metricType: "dau", metricDate: "2026-03-01", metricValue: 42 }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });

  it("accepts metadata JSONB payload", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockInsert.mockReturnValue({ values });

    await upsertSnapshot("active_by_country", "2026-03-01", 0, { countries: [] });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ metadata: { countries: [] } }));
  });
});

describe("upsertSnapshotsForDate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts multiple snapshots inside a transaction", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const txInsert = vi.fn().mockReturnValue({ values });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ insert: txInsert });
    });

    await upsertSnapshotsForDate("2026-03-01", [
      { metricType: "dau", metricValue: 10 },
      { metricType: "mau", metricValue: 200 },
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(txInsert).toHaveBeenCalledTimes(2);
  });
});

describe("getSnapshotValue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the metric value when found", async () => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ metricValue: 55 }]),
    };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getSnapshotValue("dau", "2026-03-01");
    expect(result).toBe(55);
  });

  it("returns null when not found", async () => {
    const chain = { where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getSnapshotValue("dau", "2026-03-01");
    expect(result).toBeNull();
  });
});

describe("getSnapshotSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ordered date/value pairs", async () => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        { date: "2026-03-01", value: 10 },
        { date: "2026-03-02", value: 20 },
      ]),
    };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getSnapshotSeries("registrations", "2026-03-01", "2026-03-02");
    expect(result).toEqual([
      { date: "2026-03-01", value: 10 },
      { date: "2026-03-02", value: 20 },
    ]);
  });

  it("returns empty array when no data", async () => {
    const chain = { where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getSnapshotSeries("registrations", "2026-03-01", "2026-03-02");
    expect(result).toEqual([]);
  });
});

describe("getBreakdownSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns metadata when found", async () => {
    const meta = { countries: [{ name: "Nigeria", count: 100, cities: [] }] };
    const chain = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ metadata: meta }]),
    };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getBreakdownSnapshot("active_by_country", "2026-03-01");
    expect(result).toEqual(meta);
  });

  it("returns null when not found", async () => {
    const chain = { where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getBreakdownSnapshot("active_by_country", "2026-03-01");
    expect(result).toBeNull();
  });
});

describe("getLatestBreakdownSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the most recent snapshot", async () => {
    const meta = { countries: [] };
    const chain = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ date: "2026-03-01", metadata: meta }]),
    };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getLatestBreakdownSnapshot("active_by_country");
    expect(result).toEqual({ date: "2026-03-01", metadata: meta });
  });

  it("returns null when no rows", async () => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getLatestBreakdownSnapshot("active_by_country");
    expect(result).toBeNull();
  });
});

describe("getSummaryMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps metric types to named fields", async () => {
    const chain = {
      where: vi.fn().mockResolvedValue([
        { metricType: "dau", metricValue: 100 },
        { metricType: "mau", metricValue: 2000 },
        { metricType: "registrations", metricValue: 5 },
        { metricType: "approvals", metricValue: 3 },
        { metricType: "net_growth", metricValue: 2 },
      ]),
    };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getSummaryMetrics("2026-03-01");
    expect(result).toEqual({ dau: 100, mau: 2000, registrations: 5, approvals: 3, netGrowth: 2 });
  });

  it("defaults to 0 for missing metric types", async () => {
    const chain = { where: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getSummaryMetrics("2026-03-01");
    expect(result).toEqual({ dau: 0, mau: 0, registrations: 0, approvals: 0, netGrowth: 0 });
  });
});

describe("getGrowthSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns registrations, approvals, and netGrowth series", async () => {
    const chain = { where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getGrowthSeries("2026-03-01", "2026-03-07");
    expect(result).toHaveProperty("registrations");
    expect(result).toHaveProperty("approvals");
    expect(result).toHaveProperty("netGrowth");
  });
});

describe("getEngagementMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps engagement metric types to named fields", async () => {
    const chain = {
      where: vi.fn().mockResolvedValue([
        { metricType: "posts", metricValue: 50 },
        { metricType: "messages", metricValue: 300 },
        { metricType: "articles", metricValue: 5 },
        { metricType: "events", metricValue: 2 },
        { metricType: "avg_event_attendance", metricValue: 12 },
      ]),
    };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

    const result = await getEngagementMetrics("2026-03-01");
    expect(result).toEqual({
      posts: 50,
      messages: 300,
      articles: 5,
      events: 2,
      avgEventAttendance: 12,
    });
  });
});

describe("currentlyOnlineUsers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the count from raw query", async () => {
    mockExecute.mockResolvedValue([{ cnt: 7 }]);

    const result = await currentlyOnlineUsers();
    expect(result).toBe(7);
  });

  it("returns 0 when no rows", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await currentlyOnlineUsers();
    expect(result).toBe(0);
  });
});

describe("todayPartialDau", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the count from raw query", async () => {
    mockExecute.mockResolvedValue([{ cnt: 42 }]);

    const result = await todayPartialDau();
    expect(result).toBe(42);
  });

  it("returns 0 when no rows", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await todayPartialDau();
    expect(result).toBe(0);
  });
});
