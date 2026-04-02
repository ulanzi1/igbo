import { eq, desc, sql, and, isNotNull, gte, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../index";
import { platformModerationKeywords, platformModerationActions } from "../schema/moderation";
import { communityPosts } from "../schema/community-posts";
import { communityArticles } from "../schema/community-articles";
import { platformReports } from "../schema/reports";
import { authUsers } from "../schema/auth-users";
import { memberDisciplineActions } from "../schema/member-discipline";

// Keyword type inlined — avoids app-local moderation-scanner dependency
type Keyword = { keyword: string; category: string; severity: "low" | "medium" | "high" };
import type { PlatformModerationKeyword } from "../schema/moderation";

const reporterUsers = alias(authUsers, "reporter_users");

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
  /** Whether a discipline action was issued for this specific moderation action */
  disciplineLinked: boolean;
  /** First reporter's user ID (null for auto-flagged items with no reports) */
  reporterId: string | null;
  /** First reporter's display name */
  reporterName: string | null;
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
      reportCount: sql<number>`count(*)::int`.as("reportCount"),
    })
    .from(platformReports)
    .groupBy(platformReports.contentType, platformReports.contentId)
    .as("report_counts");

  const disciplineCountSubquery = db
    .select({
      userId: memberDisciplineActions.userId,
      disciplineCount: sql<number>`count(*)::int`.as("disciplineCount"),
    })
    .from(memberDisciplineActions)
    .groupBy(memberDisciplineActions.userId)
    .as("discipline_counts");

  // Subquery to detect whether a discipline action was issued for THIS moderation action
  const disciplineLinkedSubquery = db
    .select({
      moderationActionId: memberDisciplineActions.moderationActionId,
      linked: sql<boolean>`true`.as("linked"),
    })
    .from(memberDisciplineActions)
    .where(isNotNull(memberDisciplineActions.moderationActionId))
    .groupBy(memberDisciplineActions.moderationActionId)
    .as("discipline_linked");

  // Subquery to get the first reporter (earliest report) per content item
  const firstReporterSubquery = db
    .select({
      contentType: platformReports.contentType,
      contentId: platformReports.contentId,
      reporterId:
        sql<string>`(array_agg(${platformReports.reporterId} ORDER BY ${platformReports.createdAt} ASC))[1]`.as(
          "reporterId",
        ),
    })
    .from(platformReports)
    .groupBy(platformReports.contentType, platformReports.contentId)
    .as("first_reporter");

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
        disciplineLinked: sql<boolean>`coalesce(${disciplineLinkedSubquery.linked}, false)`,
        reporterId: firstReporterSubquery.reporterId,
        reporterName: reporterUsers.name,
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
      .leftJoin(
        disciplineLinkedSubquery,
        sql`${platformModerationActions.id} = ${disciplineLinkedSubquery.moderationActionId}`,
      )
      .leftJoin(
        firstReporterSubquery,
        sql`${firstReporterSubquery.contentType}::text = ${platformModerationActions.contentType}::text AND ${firstReporterSubquery.contentId} = ${platformModerationActions.contentId}`,
      )
      .leftJoin(reporterUsers, sql`${firstReporterSubquery.reporterId}::uuid = ${reporterUsers.id}`)
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
      reportCount: sql<number>`count(*)::int`.as("reportCount"),
    })
    .from(platformReports)
    .groupBy(platformReports.contentType, platformReports.contentId)
    .as("report_counts");

  const disciplineCountSubquery = db
    .select({
      userId: memberDisciplineActions.userId,
      disciplineCount: sql<number>`count(*)::int`.as("disciplineCount"),
    })
    .from(memberDisciplineActions)
    .groupBy(memberDisciplineActions.userId)
    .as("discipline_counts");

  const disciplineLinkedSubquery = db
    .select({
      moderationActionId: memberDisciplineActions.moderationActionId,
      linked: sql<boolean>`true`.as("linked"),
    })
    .from(memberDisciplineActions)
    .where(isNotNull(memberDisciplineActions.moderationActionId))
    .groupBy(memberDisciplineActions.moderationActionId)
    .as("discipline_linked");

  const firstReporterSubquery = db
    .select({
      contentType: platformReports.contentType,
      contentId: platformReports.contentId,
      reporterId:
        sql<string>`(array_agg(${platformReports.reporterId} ORDER BY ${platformReports.createdAt} ASC))[1]`.as(
          "reporterId",
        ),
    })
    .from(platformReports)
    .groupBy(platformReports.contentType, platformReports.contentId)
    .as("first_reporter");

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
      disciplineLinked: sql<boolean>`coalesce(${disciplineLinkedSubquery.linked}, false)`,
      reporterId: firstReporterSubquery.reporterId,
      reporterName: reporterUsers.name,
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
    .leftJoin(
      disciplineLinkedSubquery,
      sql`${platformModerationActions.id} = ${disciplineLinkedSubquery.moderationActionId}`,
    )
    .leftJoin(
      firstReporterSubquery,
      sql`${firstReporterSubquery.contentType}::text = ${platformModerationActions.contentType}::text AND ${firstReporterSubquery.contentId} = ${platformModerationActions.contentId}`,
    )
    .leftJoin(reporterUsers, sql`${firstReporterSubquery.reporterId}::uuid = ${reporterUsers.id}`)
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

// ──────────────────────────────────────────────
// Retrospective scan helpers
// ──────────────────────────────────────────────

/**
 * Fetch a page of recent posts that do NOT already have a moderation action.
 * Used for retrospective keyword scanning when a new keyword is added.
 */
export async function getRecentPostsForScan(
  since: Date,
  limit: number,
  offset: number,
): Promise<Array<{ id: string; authorId: string; content: string }>> {
  const rows = await db
    .select({
      id: communityPosts.id,
      authorId: communityPosts.authorId,
      content: communityPosts.content,
    })
    .from(communityPosts)
    .leftJoin(
      platformModerationActions,
      and(
        sql`${platformModerationActions.contentType}::text = 'post'`,
        eq(platformModerationActions.contentId, communityPosts.id),
      ),
    )
    .where(
      and(
        isNull(communityPosts.deletedAt),
        gte(communityPosts.createdAt, since),
        isNull(platformModerationActions.id),
      ),
    )
    .orderBy(desc(communityPosts.createdAt))
    .limit(limit)
    .offset(offset);
  return rows as Array<{ id: string; authorId: string; content: string }>;
}

/**
 * Fetch a page of recent published articles that do NOT already have a moderation action.
 * Content is the concatenation of EN + Igbo body text for scanning.
 */
export async function getRecentArticlesForScan(
  since: Date,
  limit: number,
  offset: number,
): Promise<Array<{ id: string; authorId: string; content: string }>> {
  const rows = await db
    .select({
      id: communityArticles.id,
      authorId: communityArticles.authorId,
      content: sql<string>`concat_ws(' ', ${communityArticles.content}, ${communityArticles.contentIgbo}, ${communityArticles.titleIgbo})`,
    })
    .from(communityArticles)
    .leftJoin(
      platformModerationActions,
      and(
        sql`${platformModerationActions.contentType}::text = 'article'`,
        eq(platformModerationActions.contentId, communityArticles.id),
      ),
    )
    .where(
      and(
        isNull(communityArticles.deletedAt),
        eq(communityArticles.status, "published"),
        gte(communityArticles.createdAt, since),
        isNull(platformModerationActions.id),
      ),
    )
    .orderBy(desc(communityArticles.createdAt))
    .limit(limit)
    .offset(offset);
  return rows as Array<{ id: string; authorId: string; content: string }>;
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
    return { id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const code = (err as { code?: string }).code;
    if (code === "23505" || msg.toLowerCase().includes("unique")) {
      const err409 = new Error("Keyword already exists") as Error & { status: number };
      err409.status = 409;
      throw err409;
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
}

export async function deleteModerationKeyword(id: string): Promise<void> {
  await db.delete(platformModerationKeywords).where(eq(platformModerationKeywords.id, id));
}
