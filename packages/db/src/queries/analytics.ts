import { db } from "../index";
import {
  platformAnalyticsSnapshots,
  type PlatformAnalyticsSnapshot,
} from "../schema/platform-analytics-snapshots";
import { sql, eq, and, gte, lte, desc } from "drizzle-orm";

export type MetricType = PlatformAnalyticsSnapshot["metricType"];

/** Upsert a snapshot row — idempotent on (metric_type, metric_date). */
export async function upsertSnapshot(
  metricType: MetricType,
  metricDate: string, // ISO date: YYYY-MM-DD
  metricValue: number,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  await db
    .insert(platformAnalyticsSnapshots)
    .values({ metricType, metricDate, metricValue, metadata: metadata ?? null })
    .onConflictDoUpdate({
      target: [platformAnalyticsSnapshots.metricType, platformAnalyticsSnapshots.metricDate],
      set: { metricValue, metadata: metadata ?? null },
    });
}

/** Upsert multiple snapshots for a single date, atomically in a transaction. */
export async function upsertSnapshotsForDate(
  date: string,
  snapshots: {
    metricType: MetricType;
    metricValue: number;
    metadata?: Record<string, unknown> | null;
  }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const s of snapshots) {
      await tx
        .insert(platformAnalyticsSnapshots)
        .values({
          metricType: s.metricType,
          metricDate: date,
          metricValue: s.metricValue,
          metadata: s.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: [platformAnalyticsSnapshots.metricType, platformAnalyticsSnapshots.metricDate],
          set: { metricValue: s.metricValue, metadata: s.metadata ?? null },
        });
    }
  });
}

/** Get scalar snapshot value for a given type and date. Returns null if not found. */
export async function getSnapshotValue(
  metricType: MetricType,
  metricDate: string,
): Promise<number | null> {
  const rows = await db
    .select({ metricValue: platformAnalyticsSnapshots.metricValue })
    .from(platformAnalyticsSnapshots)
    .where(
      and(
        eq(platformAnalyticsSnapshots.metricType, metricType),
        eq(platformAnalyticsSnapshots.metricDate, metricDate),
      ),
    )
    .limit(1);
  return rows[0]?.metricValue ?? null;
}

/** Get a series of scalar snapshots for chart rendering (ordered by date ascending). */
export async function getSnapshotSeries(
  metricType: MetricType,
  fromDate: string,
  toDate: string,
): Promise<{ date: string; value: number }[]> {
  const rows = await db
    .select({
      date: platformAnalyticsSnapshots.metricDate,
      value: platformAnalyticsSnapshots.metricValue,
    })
    .from(platformAnalyticsSnapshots)
    .where(
      and(
        eq(platformAnalyticsSnapshots.metricType, metricType),
        gte(platformAnalyticsSnapshots.metricDate, fromDate),
        lte(platformAnalyticsSnapshots.metricDate, toDate),
      ),
    )
    .orderBy(platformAnalyticsSnapshots.metricDate);
  return rows.map((r) => ({ date: r.date, value: r.value }));
}

/** Get JSONB metadata snapshot for a breakdown metric (e.g. active_by_country). */
export async function getBreakdownSnapshot(
  metricType: MetricType,
  metricDate: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ metadata: platformAnalyticsSnapshots.metadata })
    .from(platformAnalyticsSnapshots)
    .where(
      and(
        eq(platformAnalyticsSnapshots.metricType, metricType),
        eq(platformAnalyticsSnapshots.metricDate, metricDate),
      ),
    )
    .limit(1);
  return (rows[0]?.metadata as Record<string, unknown> | null) ?? null;
}

/** Get latest breakdown snapshot (most recent date) for a metric type. */
export async function getLatestBreakdownSnapshot(
  metricType: MetricType,
): Promise<{ date: string; metadata: Record<string, unknown> | null } | null> {
  const rows = await db
    .select({
      date: platformAnalyticsSnapshots.metricDate,
      metadata: platformAnalyticsSnapshots.metadata,
    })
    .from(platformAnalyticsSnapshots)
    .where(eq(platformAnalyticsSnapshots.metricType, metricType))
    .orderBy(desc(platformAnalyticsSnapshots.metricDate))
    .limit(1);
  if (!rows[0]) return null;
  return {
    date: rows[0].date,
    metadata: (rows[0].metadata as Record<string, unknown> | null) ?? null,
  };
}

/** Get summary metrics for dashboard: latest DAU, MAU, registrations, approvals, net_growth. */
export async function getSummaryMetrics(toDate: string): Promise<{
  dau: number;
  mau: number;
  registrations: number;
  approvals: number;
  netGrowth: number;
}> {
  const types: MetricType[] = ["dau", "mau", "registrations", "approvals", "net_growth"];
  const rows = await db
    .select({
      metricType: platformAnalyticsSnapshots.metricType,
      metricValue: platformAnalyticsSnapshots.metricValue,
    })
    .from(platformAnalyticsSnapshots)
    .where(
      and(
        sql`${platformAnalyticsSnapshots.metricType} = ANY(ARRAY[${sql.join(
          types.map((t) => sql`${t}::analytics_metric_type`),
          sql`, `,
        )}])`,
        eq(platformAnalyticsSnapshots.metricDate, toDate),
      ),
    );

  const map: Record<string, number> = {};
  for (const r of rows) map[r.metricType] = r.metricValue;
  return {
    dau: map["dau"] ?? 0,
    mau: map["mau"] ?? 0,
    registrations: map["registrations"] ?? 0,
    approvals: map["approvals"] ?? 0,
    netGrowth: map["net_growth"] ?? 0,
  };
}

/** Get growth series for multiple metric types over a date range. */
export async function getGrowthSeries(
  fromDate: string,
  toDate: string,
): Promise<{
  registrations: { date: string; value: number }[];
  approvals: { date: string; value: number }[];
  netGrowth: { date: string; value: number }[];
}> {
  const [registrations, approvals, netGrowth] = await Promise.all([
    getSnapshotSeries("registrations", fromDate, toDate),
    getSnapshotSeries("approvals", fromDate, toDate),
    getSnapshotSeries("net_growth", fromDate, toDate),
  ]);
  return { registrations, approvals, netGrowth };
}

/** Get engagement metrics for the most recent snapshot date up to toDate. */
export async function getEngagementMetrics(toDate: string): Promise<{
  posts: number;
  messages: number;
  articles: number;
  events: number;
  avgEventAttendance: number;
}> {
  const types: MetricType[] = ["posts", "messages", "articles", "events", "avg_event_attendance"];
  const rows = await db
    .select({
      metricType: platformAnalyticsSnapshots.metricType,
      metricValue: platformAnalyticsSnapshots.metricValue,
    })
    .from(platformAnalyticsSnapshots)
    .where(
      and(
        sql`${platformAnalyticsSnapshots.metricType} = ANY(ARRAY[${sql.join(
          types.map((t) => sql`${t}::analytics_metric_type`),
          sql`, `,
        )}])`,
        eq(platformAnalyticsSnapshots.metricDate, toDate),
      ),
    );

  const map: Record<string, number> = {};
  for (const r of rows) map[r.metricType] = r.metricValue;
  return {
    posts: map["posts"] ?? 0,
    messages: map["messages"] ?? 0,
    articles: map["articles"] ?? 0,
    events: map["events"] ?? 0,
    avgEventAttendance: map["avg_event_attendance"] ?? 0,
  };
}

/** Count currently online users: sessions updated within the last 5 minutes that haven't expired. */
export async function currentlyOnlineUsers(): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const rows = await db.execute(
    sql`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM auth_sessions WHERE expires > NOW() AND last_active_at > ${fiveMinutesAgo}`,
  );
  const result = Array.from(rows);
  return (result[0] as { cnt: number } | undefined)?.cnt ?? 0;
}

/** Count distinct users active today (partial DAU for current day). */
export async function todayPartialDau(): Promise<number> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const rows = await db.execute(
    sql`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM auth_sessions WHERE last_active_at >= ${startOfToday.toISOString()}`,
  );
  const result = Array.from(rows);
  return (result[0] as { cnt: number } | undefined)?.cnt ?? 0;
}
