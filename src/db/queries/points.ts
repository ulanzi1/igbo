// No "server-only" — follows posts.ts / feed.ts pattern (imported by server-only services).
import { eq, and, sum, count, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { platformPointsLedger, platformPointsRules } from "@/db/schema/platform-points";
import type { PlatformPointsRule } from "@/db/schema/platform-points";
import { platformPostingLimits } from "@/db/schema/platform-posting-limits";
import type { MembershipTier } from "@/db/queries/auth-permissions";

// Tier baselines — mirrors PERMISSION_MATRIX.maxArticlesPerWeek without circular import.
// WARNING: If PERMISSION_MATRIX.maxArticlesPerWeek values change, update these too.
const TIER_ARTICLE_BASELINE: Record<string, number> = {
  BASIC: 0,
  PROFESSIONAL: 1,
  TOP_TIER: 2,
};

export interface InsertLedgerEntryData {
  userId: string;
  points: number;
  reason: string;
  sourceType: "like_received" | "event_attended" | "article_published";
  sourceId: string;
  multiplierApplied?: number; // defaults to 1
}

export async function insertPointsLedgerEntry(data: InsertLedgerEntryData): Promise<void> {
  await db.insert(platformPointsLedger).values({
    userId: data.userId,
    points: data.points,
    reason: data.reason,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    multiplierApplied: String(data.multiplierApplied ?? 1),
  });
}

export async function getActivePointsRules(): Promise<PlatformPointsRule[]> {
  return db.select().from(platformPointsRules).where(eq(platformPointsRules.isActive, true));
}

export async function getPointsRuleByActivityType(
  activityType: string,
): Promise<PlatformPointsRule | null> {
  const [row] = await db
    .select()
    .from(platformPointsRules)
    .where(
      and(
        eq(platformPointsRules.activityType, activityType),
        eq(platformPointsRules.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getUserPointsTotal(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(platformPointsLedger.points) })
    .from(platformPointsLedger)
    .where(eq(platformPointsLedger.userId, userId));
  return Number(row?.total ?? 0);
}

export interface LedgerHistoryRow {
  id: string;
  points: number;
  reason: string;
  sourceType: "like_received" | "event_attended" | "article_published";
  sourceId: string;
  multiplierApplied: string;
  createdAt: Date;
}

export async function getPointsLedgerHistory(
  userId: string,
  opts: { page: number; limit: number; activityType?: string },
): Promise<{ entries: LedgerHistoryRow[]; total: number }> {
  const { page, limit, activityType } = opts;
  const offset = (page - 1) * limit;

  const whereClause = activityType
    ? and(
        eq(platformPointsLedger.userId, userId),
        eq(
          platformPointsLedger.sourceType,
          activityType as "like_received" | "event_attended" | "article_published",
        ),
      )
    : eq(platformPointsLedger.userId, userId);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: platformPointsLedger.id,
        points: platformPointsLedger.points,
        reason: platformPointsLedger.reason,
        sourceType: platformPointsLedger.sourceType,
        sourceId: platformPointsLedger.sourceId,
        multiplierApplied: platformPointsLedger.multiplierApplied,
        createdAt: platformPointsLedger.createdAt,
      })
      .from(platformPointsLedger)
      .where(whereClause)
      .orderBy(desc(platformPointsLedger.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(platformPointsLedger).where(whereClause),
  ]);

  return {
    entries: rows as LedgerHistoryRow[],
    total: Number(countRows[0]?.total ?? 0),
  };
}

interface PointsSummaryRow {
  total: string;
  this_week: string;
  this_month: string;
}

export async function getPointsSummaryStats(
  userId: string,
): Promise<{ total: number; thisWeek: number; thisMonth: number }> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(points), 0) AS total,
      COALESCE(SUM(points) FILTER (WHERE created_at >= date_trunc('week', now())), 0) AS this_week,
      COALESCE(SUM(points) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS this_month
    FROM platform_points_ledger
    WHERE user_id = ${userId}
  `);
  const row = Array.from(rows)[0] as PointsSummaryRow | undefined;
  return {
    total: parseInt(row?.total ?? "0", 10),
    thisWeek: parseInt(row?.this_week ?? "0", 10),
    thisMonth: parseInt(row?.this_month ?? "0", 10),
  };
}

export async function getEffectiveArticleLimit(
  userId: string,
  tier: MembershipTier,
  preloadedPoints?: number,
): Promise<number> {
  const totalPoints = preloadedPoints ?? (await getUserPointsTotal(userId));
  const tierStr = tier as string;

  const rows = await db
    .select()
    .from(platformPostingLimits)
    .where(eq(platformPostingLimits.tier, tierStr))
    .orderBy(desc(platformPostingLimits.pointsThreshold));

  for (const row of rows) {
    if (totalPoints >= row.pointsThreshold) {
      return row.baseLimit + row.bonusLimit;
    }
  }

  return TIER_ARTICLE_BASELINE[tierStr] ?? 0;
}

export async function logPointsThrottle(params: {
  actorId: string; // reactor userId (valid UUID FK)
  earnerUserId: string;
  reason: string; // 'rapid_fire' | 'repeat_pair'
  eventType: string; // 'post.reacted'
  eventId: string; // postId
}): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: "points_throttled",
    targetUserId: params.earnerUserId,
    details: {
      reason: params.reason,
      eventType: params.eventType,
      eventId: params.eventId,
    },
  });
}
