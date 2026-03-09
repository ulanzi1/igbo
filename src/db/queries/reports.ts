import "server-only";
import { eq, and, count, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { platformReports } from "@/db/schema/reports";
import type { PlatformReport } from "@/db/schema/reports";

export type { PlatformReport };

export type ReportContentType = "post" | "comment" | "message" | "member" | "article";
export type ReportReasonCategory =
  | "harassment"
  | "spam"
  | "inappropriate_content"
  | "misinformation"
  | "impersonation"
  | "other";
export type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";

/**
 * Submit a new report.
 * Uses ON CONFLICT DO NOTHING — same user cannot report same content twice.
 * Returns created report row, or null if already reported by this user.
 *
 * PRIVACY: reporter_id is only used server-side. Never leak it to member-facing surfaces.
 */
export async function createReport(
  reporterId: string,
  contentType: ReportContentType,
  contentId: string,
  reasonCategory: ReportReasonCategory,
  reasonText?: string,
): Promise<PlatformReport | null> {
  const rows = await db
    .insert(platformReports)
    .values({
      reporterId,
      contentType,
      contentId,
      reasonCategory,
      reasonText: reasonText ?? null,
    })
    .onConflictDoNothing()
    .returning();

  return rows[0] ?? null;
}

/**
 * Count of distinct reports for a given content item (for admin aggregation).
 */
export async function getReportCountByContent(
  contentType: ReportContentType,
  contentId: string,
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(platformReports)
    .where(
      and(eq(platformReports.contentType, contentType), eq(platformReports.contentId, contentId)),
    );
  return Number(rows[0]?.count ?? 0);
}

/**
 * List reports for a specific content item.
 * PRIVACY: reporter_id is EXCLUDED from the result set — admin-safe but never surfaces identity.
 */
export async function listReportsForContent(
  contentType: ReportContentType,
  contentId: string,
): Promise<
  Array<{
    id: string;
    contentType: ReportContentType;
    contentId: string;
    reasonCategory: ReportReasonCategory;
    reasonText: string | null;
    status: ReportStatus;
    createdAt: Date;
  }>
> {
  const rows = await db
    .select({
      id: platformReports.id,
      contentType: platformReports.contentType,
      contentId: platformReports.contentId,
      reasonCategory: platformReports.reasonCategory,
      reasonText: platformReports.reasonText,
      status: platformReports.status,
      createdAt: platformReports.createdAt,
    })
    .from(platformReports)
    .where(
      and(eq(platformReports.contentType, contentType), eq(platformReports.contentId, contentId)),
    )
    .orderBy(desc(platformReports.createdAt));

  return rows as Array<{
    id: string;
    contentType: ReportContentType;
    contentId: string;
    reasonCategory: ReportReasonCategory;
    reasonText: string | null;
    status: ReportStatus;
    createdAt: Date;
  }>;
}

export interface AdminReportItem {
  contentType: ReportContentType;
  contentId: string;
  reportCount: number;
  latestReasonCategory: ReportReasonCategory;
  earliestCreatedAt: Date;
}

/**
 * Admin queue: reports aggregated by (content_type, content_id).
 * Shows report_count, latest reason, earliest created_at.
 * PRIVACY: reporter_id is EXCLUDED — never exposed even to admins via this surface.
 */
export async function listReportsAdmin(
  filters: { status?: ReportStatus },
  pagination: { page: number; pageSize: number },
): Promise<{ items: AdminReportItem[]; total: number }> {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  const where = filters.status ? eq(platformReports.status, filters.status) : undefined;

  const baseQuery = db
    .select({
      contentType: platformReports.contentType,
      contentId: platformReports.contentId,
      reportCount: count().as("report_count"),
      latestReasonCategory: sql<ReportReasonCategory>`
        (array_agg(${platformReports.reasonCategory} ORDER BY ${platformReports.createdAt} DESC))[1]
      `.as("latest_reason_category"),
      earliestCreatedAt: sql<Date>`min(${platformReports.createdAt})`.as("earliest_created_at"),
    })
    .from(platformReports)
    .$dynamic();

  const withWhere = where ? baseQuery.where(where) : baseQuery;

  const [rows, countRows] = await Promise.all([
    withWhere
      .groupBy(platformReports.contentType, platformReports.contentId)
      .orderBy(sql`min(${platformReports.createdAt}) ASC`)
      .limit(pageSize)
      .offset(offset),
    // Count distinct (content_type, content_id) pairs
    db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(
        db
          .select({ _ct: platformReports.contentType, _ci: platformReports.contentId })
          .from(platformReports)
          .$dynamic()
          .where(where ?? sql`1=1`)
          .groupBy(platformReports.contentType, platformReports.contentId)
          .as("sub"),
      ),
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map((r) => ({
      contentType: r.contentType,
      contentId: r.contentId,
      reportCount: Number(r.reportCount),
      latestReasonCategory: r.latestReasonCategory,
      earliestCreatedAt: new Date(r.earliestCreatedAt),
    })),
    total,
  };
}

/**
 * Update a report's status (admin action).
 */
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  reviewedBy: string,
): Promise<void> {
  await db
    .update(platformReports)
    .set({
      status,
      reviewedBy,
      reviewedAt: new Date(),
    })
    .where(eq(platformReports.id, reportId));
}
