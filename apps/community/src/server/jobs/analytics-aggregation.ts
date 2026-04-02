import "server-only";
import { registerJob } from "@/server/jobs/job-runner";
import { db } from "@/db";
import { upsertSnapshotsForDate } from "@/db/queries/analytics";
import { sql } from "drizzle-orm";

type MetricType =
  | "dau"
  | "mau"
  | "registrations"
  | "approvals"
  | "net_growth"
  | "posts"
  | "messages"
  | "articles"
  | "events"
  | "avg_event_attendance"
  | "active_by_tier"
  | "active_by_country"
  | "top_content";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Heuristic: parse "City, Country" or "Country" from a free-text location string.
 * Returns { city, country } where city may be null.
 */
function parseLocation(raw: string | null): { city: string | null; country: string } | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const country = parts[parts.length - 1]!;
  const city = parts.length > 1 ? parts[parts.length - 2]! : null;
  return { country, city };
}

async function aggregateForDate(targetDate: Date): Promise<void> {
  const dateStr = toIsoDate(targetDate);
  const startOfDay = new Date(targetDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // --- DAU: distinct users active (session updated) on this day ---
  const dauRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM auth_sessions WHERE updated_at >= ${startOfDay} AND updated_at <= ${endOfDay}`,
    ),
  );
  const dau = (dauRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- MAU: distinct users active in rolling 30 days ending on targetDate ---
  const thirtyDaysAgo = new Date(targetDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
  const mauRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM auth_sessions WHERE updated_at >= ${thirtyDaysAgo} AND updated_at <= ${endOfDay}`,
    ),
  );
  const mau = (mauRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- Registrations: new users created on this day ---
  const regRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM auth_users WHERE created_at >= ${startOfDay} AND created_at <= ${endOfDay} AND deleted_at IS NULL`,
    ),
  );
  const registrations = (regRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- Approvals: count audit log entries for APPROVE_APPLICATION on this day ---
  const approvalRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM audit_logs WHERE action = 'APPROVE_APPLICATION' AND created_at >= ${startOfDay} AND created_at <= ${endOfDay}`,
    ),
  );
  const approvals = (approvalRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- Net growth: approvals minus deletions/anonymizations on this day ---
  const deletionRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM auth_users WHERE account_status IN ('PENDING_DELETION','ANONYMIZED') AND updated_at >= ${startOfDay} AND updated_at <= ${endOfDay}`,
    ),
  );
  const deletions = (deletionRows[0] as { cnt: number } | undefined)?.cnt ?? 0;
  const netGrowth = approvals - deletions;

  // --- Posts created on this day ---
  const postRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM community_posts WHERE created_at >= ${startOfDay} AND created_at <= ${endOfDay} AND deleted_at IS NULL`,
    ),
  );
  const posts = (postRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- Messages sent on this day ---
  const msgRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM chat_messages WHERE created_at >= ${startOfDay} AND created_at <= ${endOfDay} AND deleted_at IS NULL`,
    ),
  );
  const messages = (msgRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- Articles published on this day ---
  const articleRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM community_articles WHERE published_at >= ${startOfDay} AND published_at <= ${endOfDay}`,
    ),
  );
  const articles = (articleRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- Events created on this day ---
  const eventRows = Array.from(
    await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM community_events WHERE created_at >= ${startOfDay} AND created_at <= ${endOfDay}`,
    ),
  );
  const events = (eventRows[0] as { cnt: number } | undefined)?.cnt ?? 0;

  // --- Average event attendance (across all events on this day) ---
  const attendRows = Array.from(
    await db.execute(
      sql`SELECT COALESCE(AVG(attendee_count), 0)::int AS avg_attendance FROM community_events WHERE created_at >= ${startOfDay} AND created_at <= ${endOfDay}`,
    ),
  );
  const avgEventAttendance =
    (attendRows[0] as { avg_attendance: number } | undefined)?.avg_attendance ?? 0;

  // --- Active by tier: all active members grouped by tier (total distribution) ---
  const tierRows = Array.from(
    await db.execute(
      sql`SELECT membership_tier, COUNT(*)::int AS cnt FROM auth_users WHERE deleted_at IS NULL AND account_status = 'ACTIVE' GROUP BY membership_tier`,
    ),
  );
  const tierBreakdown: Record<string, number> = {};
  for (const r of tierRows) {
    const row = r as { membership_tier: string; cnt: number };
    tierBreakdown[row.membership_tier] = row.cnt;
  }

  // --- Active by country (geographic breakdown via SQL aggregation) ---
  const geoRows = Array.from(
    await db.execute(
      sql`
        SELECT COALESCE(p.location, u.location) AS raw_location, COUNT(*)::int AS cnt
        FROM auth_users u
        LEFT JOIN community_profiles p ON p.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.account_status = 'ACTIVE'
          AND COALESCE(p.location, u.location) IS NOT NULL
          AND TRIM(COALESCE(p.location, u.location)) != ''
        GROUP BY COALESCE(p.location, u.location)
      `,
    ),
  );

  const countryMap: Map<string, { count: number; cities: Map<string, number> }> = new Map();
  for (const r of geoRows) {
    const row = r as { raw_location: string; cnt: number };
    const parsed = parseLocation(row.raw_location);
    if (!parsed) continue;
    const { country, city } = parsed;
    if (!countryMap.has(country)) countryMap.set(country, { count: 0, cities: new Map() });
    const entry = countryMap.get(country)!;
    entry.count += row.cnt;
    if (city) {
      entry.cities.set(city, (entry.cities.get(city) ?? 0) + row.cnt);
    }
  }
  const countries = Array.from(countryMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data]) => ({
      name,
      count: data.count,
      cities: Array.from(data.cities.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([cityName, cnt]) => ({ name: cityName, count: cnt })),
    }));

  // --- Top content by engagement (reactions + comments) ---
  const topContentRows = Array.from(
    await db.execute(
      sql`
        SELECT
          p.id,
          p.content,
          p.created_at,
          COALESCE(r.reaction_cnt, 0) + COALESCE(c.comment_cnt, 0) AS engagement
        FROM community_posts p
        LEFT JOIN (
          SELECT post_id, COUNT(*)::int AS reaction_cnt FROM post_interactions WHERE type = 'reaction' GROUP BY post_id
        ) r ON r.post_id = p.id
        LEFT JOIN (
          SELECT post_id, COUNT(*)::int AS comment_cnt FROM post_interactions WHERE type = 'comment' GROUP BY post_id
        ) c ON c.post_id = p.id
        WHERE p.deleted_at IS NULL
        ORDER BY engagement DESC
        LIMIT 10
      `,
    ),
  );
  const topContent = Array.from(topContentRows).map((r) => {
    const row = r as {
      id: string;
      content: string | null;
      created_at: string;
      engagement: number;
    };
    return {
      id: row.id,
      preview: (row.content ?? "").slice(0, 100),
      engagement: row.engagement,
      createdAt: row.created_at,
    };
  });

  const snapshots: {
    metricType: MetricType;
    metricValue: number;
    metadata?: Record<string, unknown> | null;
  }[] = [
    { metricType: "dau", metricValue: dau },
    { metricType: "mau", metricValue: mau },
    { metricType: "registrations", metricValue: registrations },
    { metricType: "approvals", metricValue: approvals },
    { metricType: "net_growth", metricValue: netGrowth },
    { metricType: "posts", metricValue: posts },
    { metricType: "messages", metricValue: messages },
    { metricType: "articles", metricValue: articles },
    { metricType: "events", metricValue: events },
    { metricType: "avg_event_attendance", metricValue: avgEventAttendance },
    { metricType: "active_by_tier", metricValue: 0, metadata: { tiers: tierBreakdown } },
    { metricType: "active_by_country", metricValue: 0, metadata: { countries } },
    { metricType: "top_content", metricValue: 0, metadata: { items: topContent } },
  ];

  await upsertSnapshotsForDate(dateStr, snapshots);

  console.info(
    JSON.stringify({
      level: "info",
      message: "analytics-aggregation.complete",
      date: dateStr,
      dau,
      mau,
      registrations,
      approvals,
      netGrowth,
      posts,
      messages,
      articles,
      events,
      avgEventAttendance,
      countriesCount: countries.length,
      topContentCount: topContent.length,
    }),
  );
}

registerJob(
  "analytics-aggregation",
  async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await aggregateForDate(yesterday);
  },
  { retries: 2, timeoutMs: 120_000 },
);

// Export for testing
export { aggregateForDate };
