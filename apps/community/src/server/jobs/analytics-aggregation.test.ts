// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockUpsertSnapshotsForDate = vi.hoisted(() => vi.fn());
const mockDbExecute = vi.hoisted(() => vi.fn());
const mockRegisterJob = vi.hoisted(() => vi.fn());

vi.mock("@igbo/db/queries/analytics", () => ({
  upsertSnapshotsForDate: mockUpsertSnapshotsForDate,
}));

vi.mock("@igbo/db", () => ({
  db: {
    execute: mockDbExecute,
  },
}));

vi.mock("@/server/jobs/job-runner", () => ({
  registerJob: mockRegisterJob,
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign((strings: TemplateStringsArray) => ({ sql: strings.join("?") }), {
    join: vi.fn(() => ({})),
  }),
}));

const DEFAULT_ROW = { cnt: 0 };
const DEFAULT_TIER_ROWS: unknown[] = [];
const DEFAULT_GEO_ROWS: unknown[] = [];
const DEFAULT_TOP_ROWS: unknown[] = [];
const DEFAULT_ATTEND_ROW = { avg_attendance: 0 };

function setupMocks(overrides: Record<string, unknown[]> = {}) {
  mockDbExecute.mockImplementation((_query: unknown) => {
    // We can't distinguish queries, so return reasonable defaults for all calls
    return Promise.resolve(overrides.default ?? [DEFAULT_ROW]);
  });
}

describe("analytics-aggregation job", () => {
  let registeredHandler: (() => Promise<void>) | undefined;
  let aggregateForDate: (d: Date) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRegisterJob.mockImplementation((_name: string, fn: () => Promise<void>) => {
      registeredHandler = fn;
    });
    mockUpsertSnapshotsForDate.mockResolvedValue(undefined);

    // Default: all queries return a single row with cnt=0 or appropriate defaults
    mockDbExecute.mockResolvedValue([
      {
        cnt: 0,
        avg_attendance: 0,
        membership_tier: "BASIC",
        location: null,
        profile_location: null,
        id: "uuid",
        content: null,
        created_at: "2026-03-01",
        engagement: 0,
      },
    ]);

    const mod = await import("./analytics-aggregation");
    aggregateForDate = mod.aggregateForDate;
  });

  it("registers a job named 'analytics-aggregation'", () => {
    expect(mockRegisterJob).toHaveBeenCalledWith(
      "analytics-aggregation",
      expect.any(Function),
      expect.objectContaining({ retries: 2, timeoutMs: 120_000 }),
    );
  });

  it("calls upsertSnapshotsForDate with correct date on success", async () => {
    const targetDate = new Date("2026-03-01T00:00:00.000Z");
    await aggregateForDate(targetDate);

    expect(mockUpsertSnapshotsForDate).toHaveBeenCalledWith("2026-03-01", expect.any(Array));
  });

  it("upserts all required metric types", async () => {
    const targetDate = new Date("2026-03-01T00:00:00.000Z");
    await aggregateForDate(targetDate);

    const [, snapshots] = mockUpsertSnapshotsForDate.mock.calls[0] as [
      string,
      { metricType: string }[],
    ];
    const types = snapshots.map((s) => s.metricType);
    expect(types).toContain("dau");
    expect(types).toContain("mau");
    expect(types).toContain("registrations");
    expect(types).toContain("approvals");
    expect(types).toContain("net_growth");
    expect(types).toContain("posts");
    expect(types).toContain("messages");
    expect(types).toContain("articles");
    expect(types).toContain("events");
    expect(types).toContain("avg_event_attendance");
    expect(types).toContain("active_by_tier");
    expect(types).toContain("active_by_country");
    expect(types).toContain("top_content");
  });

  it("idempotent: calling aggregateForDate twice for same date calls upsert twice", async () => {
    const targetDate = new Date("2026-03-01T00:00:00.000Z");
    await aggregateForDate(targetDate);
    await aggregateForDate(targetDate);
    expect(mockUpsertSnapshotsForDate).toHaveBeenCalledTimes(2);
  });

  it("propagates errors from upsertSnapshotsForDate", async () => {
    mockUpsertSnapshotsForDate.mockRejectedValue(new Error("DB write failed"));
    const targetDate = new Date("2026-03-01T00:00:00.000Z");
    await expect(aggregateForDate(targetDate)).rejects.toThrow("DB write failed");
  });

  it("job handler runs without error", async () => {
    await expect(registeredHandler?.()).resolves.not.toThrow();
  });
});
