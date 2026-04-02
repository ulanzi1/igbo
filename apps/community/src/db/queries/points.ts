// No "server-only" — follows posts.ts / feed.ts pattern (imported by server-only services).
import { eq, and, sum, count, desc, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { platformPointsLedger, platformPointsRules } from "@/db/schema/platform-points";
import type { PlatformPointsRule } from "@/db/schema/platform-points";
import { platformPostingLimits } from "@/db/schema/platform-posting-limits";
import type { PlatformPostingLimit } from "@/db/schema/platform-posting-limits";
import type { MembershipTier } from "@/db/queries/auth-permissions";
import type { BadgeType } from "@/db/schema/community-badges";

export type { PlatformPostingLimit };

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

export async function getAllPointsRules(): Promise<PlatformPointsRule[]> {
  return db.select().from(platformPointsRules);
}

export async function updatePointsRule(
  id: string,
  updates: { basePoints?: number; isActive?: boolean },
): Promise<PlatformPointsRule | null> {
  const [row] = await db
    .update(platformPointsRules)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(platformPointsRules.id, id))
    .returning();
  return row ?? null;
}

export async function updatePostingLimit(
  id: string,
  updates: { baseLimit?: number; bonusLimit?: number; pointsThreshold?: number },
): Promise<PlatformPostingLimit | null> {
  const [row] = await db
    .update(platformPostingLimits)
    .set(updates)
    .where(eq(platformPostingLimits.id, id))
    .returning();
  return row ?? null;
}

export async function getAllPostingLimits(): Promise<PlatformPostingLimit[]> {
  return db
    .select()
    .from(platformPostingLimits)
    .orderBy(asc(platformPostingLimits.tier), asc(platformPostingLimits.pointsThreshold));
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

export interface TopPointsEarnerRow {
  userId: string;
  displayName: string | null;
  email: string;
  totalPoints: number;
  badgeType: BadgeType | null;
  memberSince: string;
}

export async function getTopPointsEarners(opts: {
  page: number;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
  activityType?: string;
}): Promise<{ users: TopPointsEarnerRow[]; total: number }> {
  const { page, limit, dateFrom, dateTo, activityType } = opts;

  // Validate dateFrom <= dateTo; return empty results if invalid
  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    return { users: [], total: 0 };
  }

  const offset = (page - 1) * limit;

  const dateFromFilter = dateFrom ? sql`AND ppl.created_at >= ${dateFrom}::timestamptz` : sql``;
  const dateToFilter = dateTo ? sql`AND ppl.created_at <= ${dateTo}::timestamptz` : sql``;
  const activityFilter = activityType ? sql`AND ppl.source_type = ${activityType}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      au.id AS user_id,
      cp.display_name,
      au.email,
      COALESCE(SUM(ppl.points), 0) AS total_points,
      cub.badge_type,
      au.created_at AS member_since,
      COUNT(*) OVER() AS total_count
    FROM platform_points_ledger ppl
    INNER JOIN auth_users au ON au.id = ppl.user_id AND au.deleted_at IS NULL
    LEFT JOIN community_profiles cp ON cp.user_id = ppl.user_id
    LEFT JOIN community_user_badges cub ON cub.user_id = ppl.user_id
    WHERE 1=1
      ${dateFromFilter}
      ${dateToFilter}
      ${activityFilter}
    GROUP BY au.id, cp.display_name, au.email, cub.badge_type, au.created_at
    ORDER BY total_points DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const arr = Array.from(rows) as Array<{
    user_id: string;
    display_name: string | null;
    email: string;
    total_points: string;
    badge_type: string | null;
    member_since: string;
    total_count: string;
  }>;

  if (arr.length === 0) return { users: [], total: 0 };

  const total = parseInt(arr[0]!.total_count, 10);
  const users: TopPointsEarnerRow[] = arr.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    totalPoints: parseInt(row.total_points, 10),
    badgeType: row.badge_type as BadgeType | null,
    memberSince: row.member_since,
  }));

  return { users, total };
}

export interface ThrottledUserRow {
  userId: string;
  displayName: string | null;
  throttleCount: number;
  lastThrottledAt: string;
  reasons: string[];
}

export async function getThrottledUsersReport(opts: {
  page: number;
  limit: number;
}): Promise<{ users: ThrottledUserRow[]; total: number }> {
  const { page, limit } = opts;
  const offset = (page - 1) * limit;

  const rows = await db.execute(sql`
    SELECT
      al.target_user_id AS user_id,
      cp.display_name,
      COUNT(*) AS throttle_count,
      MAX(al.created_at) AS last_throttled_at,
      array_to_json(array_agg(DISTINCT al.details->>'reason') FILTER (WHERE al.details->>'reason' IS NOT NULL)) AS reasons,
      COUNT(*) OVER() AS total_count
    FROM audit_logs al
    INNER JOIN auth_users au ON au.id = al.target_user_id AND au.deleted_at IS NULL
    LEFT JOIN community_profiles cp ON cp.user_id = al.target_user_id
    WHERE al.action = 'points_throttled'
      AND al.target_user_id IS NOT NULL
    GROUP BY al.target_user_id, cp.display_name
    ORDER BY throttle_count DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const arr = Array.from(rows) as Array<{
    user_id: string;
    display_name: string | null;
    throttle_count: string;
    last_throttled_at: string;
    reasons: string[];
    total_count: string;
  }>;

  if (arr.length === 0) return { users: [], total: 0 };

  const total = parseInt(arr[0]!.total_count, 10);
  const users: ThrottledUserRow[] = arr.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    throttleCount: parseInt(row.throttle_count, 10),
    lastThrottledAt: row.last_throttled_at,
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
  }));

  return { users, total };
}

export interface AdminUserPointsProfile {
  userId: string;
  displayName: string | null;
  email: string;
  memberSince: string;
  badgeType: BadgeType | null;
  badgeAssignedAt: string | null;
}

export async function getAdminUserPointsProfile(
  userId: string,
): Promise<AdminUserPointsProfile | null> {
  const rows = await db.execute(sql`
    SELECT
      au.id AS user_id,
      cp.display_name,
      au.email,
      au.created_at AS member_since,
      cub.badge_type,
      cub.assigned_at AS badge_assigned_at
    FROM auth_users au
    LEFT JOIN community_profiles cp ON cp.user_id = au.id
    LEFT JOIN community_user_badges cub ON cub.user_id = au.id
    WHERE au.id = ${userId}
      AND au.deleted_at IS NULL
  `);
  const arr = Array.from(rows) as Array<{
    user_id: string;
    display_name: string | null;
    email: string;
    member_since: string;
    badge_type: string | null;
    badge_assigned_at: string | null;
  }>;
  const row = arr[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    memberSince: row.member_since,
    badgeType: row.badge_type as BadgeType | null,
    badgeAssignedAt: row.badge_assigned_at,
  };
}

export interface ThrottleHistoryEntry {
  date: string;
  reason: string | null;
  eventType: string | null;
  eventId: string | null;
  triggeredBy: string | null;
}

export async function getUserThrottleHistory(
  userId: string,
  opts: { page: number; limit: number },
): Promise<{ entries: ThrottleHistoryEntry[]; total: number }> {
  const { page, limit } = opts;
  const offset = (page - 1) * limit;

  const rows = await db.execute(sql`
    SELECT
      al.created_at AS date,
      al.details->>'reason' AS reason,
      al.details->>'eventType' AS event_type,
      al.details->>'eventId' AS event_id,
      cp.display_name AS triggered_by,
      COUNT(*) OVER() AS total_count
    FROM audit_logs al
    LEFT JOIN community_profiles cp ON cp.user_id = al.actor_id
    WHERE al.action = 'points_throttled'
      AND al.target_user_id = ${userId}
    ORDER BY al.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const arr = Array.from(rows) as Array<{
    date: string;
    reason: string | null;
    event_type: string | null;
    event_id: string | null;
    triggered_by: string | null;
    total_count: string;
  }>;

  if (arr.length === 0) return { entries: [], total: 0 };

  const total = parseInt(arr[0]!.total_count, 10);
  const entries: ThrottleHistoryEntry[] = arr.map((row) => ({
    date: row.date,
    reason: row.reason,
    eventType: row.event_type,
    eventId: row.event_id,
    triggeredBy: row.triggered_by,
  }));

  return { entries, total };
}

export interface MemberSearchResult {
  userId: string;
  displayName: string | null;
  email: string;
}

export async function searchMembersForAdmin(
  query: string,
  limit = 10,
): Promise<MemberSearchResult[]> {
  const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const pattern = `%${escaped}%`;

  const rows = await db.execute(sql`
    SELECT
      au.id AS user_id,
      cp.display_name,
      au.email
    FROM auth_users au
    LEFT JOIN community_profiles cp ON cp.user_id = au.id
    WHERE au.deleted_at IS NULL
      AND (
        au.email ILIKE ${pattern}
        OR cp.display_name ILIKE ${pattern}
      )
    ORDER BY cp.display_name ASC NULLS LAST
    LIMIT ${limit}
  `);

  const arr = Array.from(rows) as Array<{
    user_id: string;
    display_name: string | null;
    email: string;
  }>;

  return arr.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
  }));
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
