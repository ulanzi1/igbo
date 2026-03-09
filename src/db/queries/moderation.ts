import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { platformModerationKeywords, platformModerationActions } from "@/db/schema/moderation";
import { platformReports } from "@/db/schema/reports";
import { authUsers } from "@/db/schema/auth-users";
import { memberDisciplineActions } from "@/db/schema/member-discipline";
import type { Keyword } from "@/lib/moderation-scanner";
import type { PlatformModerationKeyword } from "@/db/schema/moderation";
import { ApiError } from "@/lib/api-error";
import { getRedisClient } from "@/lib/redis";

export type { PlatformModerationKeyword };

export interface ModerationQueueItem {
  id: string;
  contentType: "post" | "article" | "message";
  contentId: string;
  contentPreview: string | null;
  contentAuthorId: string;
  authorName: string | null;
  flagReason: string;
  keywordMatched: string | null;
  autoFlagged: boolean;
  flaggedAt: Date;
  status: "pending" | "reviewed" | "dismissed";
  visibilityOverride: "visible" | "hidden";
  reportCount: number;
  authorAccountStatus: string | null;
  disciplineCount: number;
}

async function invalidateKeywordCache(): Promise<void> {
  try {
    await getRedisClient().del("moderation:keywords:active");
  } catch {
    // Non-critical — cache invalidation failure should not throw
  }
}

/**
 * Fetch all active keywords for content scanning.
 * Returns only the fields needed by scanContent() (keyword, category, severity).
 */
export async function getActiveKeywords(): Promise<Keyword[]> {
  const rows = await db
    .select({
      keyword: platformModerationKeywords.keyword,
      category: platformModerationKeywords.category,
      severity: platformModerationKeywords.severity,
    })
    .from(platformModerationKeywords)
    .where(eq(platformModerationKeywords.isActive, true));
  return rows;
}

export interface InsertModerationActionParams {
  contentType: "post" | "article" | "message";
  contentId: string;
  contentAuthorId: string;
  contentPreview: string | null;
  flagReason: string;
  keywordMatched: string | null;
  autoFlagged?: boolean;
}

/**
 * Insert a moderation flag record.
 * Uses ON CONFLICT DO NOTHING — one flag per content item.
 * Returns { id } of inserted row, or null when a flag already exists (conflict).
 */
export async function insertModerationAction(
  params: InsertModerationActionParams,
): Promise<{ id: string } | null> {
  const rows = await db
    .insert(platformModerationActions)
    .values({
      contentType: params.contentType,
      contentId: params.contentId,
      contentAuthorId: params.contentAuthorId,
      contentPreview: params.contentPreview,
      flagReason: params.flagReason,
      keywordMatched: params.keywordMatched,
      autoFlagged: params.autoFlagged ?? true,
    })
    .onConflictDoNothing()
    .returning({ id: platformModerationActions.id });

  return rows[0] ?? null;
}

// ──────────────────────────────────────────────
// Admin moderation queue CRUD
// ──────────────────────────────────────────────

export async function listFlaggedContent(filters: {
  status?: "pending" | "reviewed" | "dismissed";
  contentType?: "post" | "article" | "message";
  page: number;
  pageSize: number;
}): Promise<{ items: ModerationQueueItem[]; total: number }> {
  const { status = "pending", contentType, page, pageSize } = filters;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(platformModerationActions.status, status)];
  if (contentType) {
    conditions.push(eq(platformModerationActions.contentType, contentType));
  }
  const where = and(...conditions);

  const reportCountSubquery = db
    .select({
      contentType: platformReports.contentType,
      contentId: platformReports.contentId,
      reportCount: sql<number>`count(*)::int`,
    })
    .from(platformReports)
    .groupBy(platformReports.contentType, platformReports.contentId)
    .as("report_counts");

  const disciplineCountSubquery = db
    .select({
      userId: memberDisciplineActions.userId,
      disciplineCount: sql<number>`count(*)::int`,
    })
    .from(memberDisciplineActions)
    .groupBy(memberDisciplineActions.userId)
    .as("discipline_counts");

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: platformModerationActions.id,
        contentType: platformModerationActions.contentType,
        contentId: platformModerationActions.contentId,
        contentPreview: platformModerationActions.contentPreview,
        contentAuthorId: platformModerationActions.contentAuthorId,
        authorName: authUsers.name,
        flagReason: platformModerationActions.flagReason,
        keywordMatched: platformModerationActions.keywordMatched,
        autoFlagged: platformModerationActions.autoFlagged,
        flaggedAt: platformModerationActions.flaggedAt,
        status: platformModerationActions.status,
        visibilityOverride: platformModerationActions.visibilityOverride,
        reportCount: sql<number>`coalesce(${reportCountSubquery.reportCount}, 0)`,
        authorAccountStatus: authUsers.accountStatus,
        disciplineCount: sql<number>`coalesce(${disciplineCountSubquery.disciplineCount}, 0)`,
      })
      .from(platformModerationActions)
      .leftJoin(
        authUsers,
        sql`${platformModerationActions.contentAuthorId}::uuid = ${authUsers.id}`,
      )
      .leftJoin(
        reportCountSubquery,
        sql`${reportCountSubquery.contentType}::text = ${platformModerationActions.contentType}::text AND ${reportCountSubquery.contentId} = ${platformModerationActions.contentId}`,
      )
      .leftJoin(
        disciplineCountSubquery,
        sql`${platformModerationActions.contentAuthorId}::uuid = ${disciplineCountSubquery.userId}`,
      )
      .where(where)
      .orderBy(desc(platformModerationActions.flaggedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(platformModerationActions)
      .where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  return { items: rows as ModerationQueueItem[], total };
}

export async function getModerationActionById(id: string): Promise<ModerationQueueItem | null> {
  const reportCountSubquery = db
    .select({
      contentType: platformReports.contentType,
      contentId: platformReports.contentId,
      reportCount: sql<number>`count(*)::int`,
    })
    .from(platformReports)
    .groupBy(platformReports.contentType, platformReports.contentId)
    .as("report_counts");

  const disciplineCountSubquery = db
    .select({
      userId: memberDisciplineActions.userId,
      disciplineCount: sql<number>`count(*)::int`,
    })
    .from(memberDisciplineActions)
    .groupBy(memberDisciplineActions.userId)
    .as("discipline_counts");

  const rows = await db
    .select({
      id: platformModerationActions.id,
      contentType: platformModerationActions.contentType,
      contentId: platformModerationActions.contentId,
      contentPreview: platformModerationActions.contentPreview,
      contentAuthorId: platformModerationActions.contentAuthorId,
      authorName: authUsers.name,
      flagReason: platformModerationActions.flagReason,
      keywordMatched: platformModerationActions.keywordMatched,
      autoFlagged: platformModerationActions.autoFlagged,
      flaggedAt: platformModerationActions.flaggedAt,
      status: platformModerationActions.status,
      visibilityOverride: platformModerationActions.visibilityOverride,
      reportCount: sql<number>`coalesce(${reportCountSubquery.reportCount}, 0)`,
      authorAccountStatus: authUsers.accountStatus,
      disciplineCount: sql<number>`coalesce(${disciplineCountSubquery.disciplineCount}, 0)`,
    })
    .from(platformModerationActions)
    .leftJoin(authUsers, sql`${platformModerationActions.contentAuthorId}::uuid = ${authUsers.id}`)
    .leftJoin(
      reportCountSubquery,
      sql`${reportCountSubquery.contentType}::text = ${platformModerationActions.contentType}::text AND ${reportCountSubquery.contentId} = ${platformModerationActions.contentId}`,
    )
    .leftJoin(
      disciplineCountSubquery,
      sql`${platformModerationActions.contentAuthorId}::uuid = ${disciplineCountSubquery.userId}`,
    )
    .where(eq(platformModerationActions.id, id))
    .limit(1);

  return (rows[0] as ModerationQueueItem) ?? null;
}

export async function updateModerationAction(
  id: string,
  update: {
    status: "pending" | "reviewed" | "dismissed";
    moderatorId: string;
    visibilityOverride?: "visible" | "hidden";
    actionedAt: Date;
  },
): Promise<void> {
  await db
    .update(platformModerationActions)
    .set({
      status: update.status,
      moderatorId: update.moderatorId,
      ...(update.visibilityOverride ? { visibilityOverride: update.visibilityOverride } : {}),
      actionedAt: update.actionedAt,
    })
    .where(eq(platformModerationActions.id, id));
}

export async function listModerationKeywords(filters?: {
  isActive?: boolean;
}): Promise<PlatformModerationKeyword[]> {
  if (filters?.isActive !== undefined) {
    return db
      .select()
      .from(platformModerationKeywords)
      .where(eq(platformModerationKeywords.isActive, filters.isActive));
  }
  return db.select().from(platformModerationKeywords);
}

export async function addModerationKeyword(params: {
  keyword: string;
  category: "hate_speech" | "explicit" | "spam" | "harassment" | "other";
  severity: "low" | "medium" | "high";
  notes?: string;
  createdBy: string;
}): Promise<{ id: string }> {
  try {
    const rows = await db
      .insert(platformModerationKeywords)
      .values({
        keyword: params.keyword,
        category: params.category,
        severity: params.severity,
        notes: params.notes ?? null,
        createdBy: params.createdBy,
      })
      .returning({ id: platformModerationKeywords.id });

    const id = rows[0]?.id;
    if (!id) throw new Error("Insert returned no id");
    await invalidateKeywordCache();
    return { id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const code = (err as { code?: string }).code;
    if (code === "23505" || msg.toLowerCase().includes("unique")) {
      throw new ApiError({ title: "Conflict", status: 409, detail: "Keyword already exists" });
    }
    throw err;
  }
}

export async function updateModerationKeyword(
  id: string,
  update: Partial<{
    keyword: string;
    category: "hate_speech" | "explicit" | "spam" | "harassment" | "other";
    severity: "low" | "medium" | "high";
    notes: string;
    isActive: boolean;
  }>,
): Promise<void> {
  await db
    .update(platformModerationKeywords)
    .set(update)
    .where(eq(platformModerationKeywords.id, id));
  await invalidateKeywordCache();
}

export async function deleteModerationKeyword(id: string): Promise<void> {
  await db.delete(platformModerationKeywords).where(eq(platformModerationKeywords.id, id));
  await invalidateKeywordCache();
}
