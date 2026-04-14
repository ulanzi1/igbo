import "server-only";
import { db } from "../index";
import { portalPostingReports } from "../schema/portal-posting-reports";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import type {
  PortalPostingReport,
  NewPortalPostingReport,
  PortalReportPriority,
} from "../schema/portal-posting-reports";
import { eq, and, inArray, sql, desc } from "drizzle-orm";

export type { PortalPostingReport, NewPortalPostingReport };

export interface PostingWithReportCount {
  postingId: string;
  postingTitle: string;
  companyName: string;
  companyId: string;
  reportCount: number;
  latestReportAt: Date;
  priority: PortalReportPriority;
}

export async function insertPostingReport(
  data: NewPortalPostingReport,
): Promise<PortalPostingReport> {
  const [inserted] = await db.insert(portalPostingReports).values(data).returning();
  if (!inserted) throw new Error("insertPostingReport: no row returned");
  return inserted;
}

export async function getExistingActiveReportForUser(
  postingId: string,
  userId: string,
): Promise<PortalPostingReport | null> {
  const [row] = await db
    .select()
    .from(portalPostingReports)
    .where(
      and(
        eq(portalPostingReports.postingId, postingId),
        eq(portalPostingReports.reporterUserId, userId),
        inArray(portalPostingReports.status, ["open", "investigating"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getReportsForPosting(postingId: string): Promise<PortalPostingReport[]> {
  return db
    .select()
    .from(portalPostingReports)
    .where(eq(portalPostingReports.postingId, postingId))
    .orderBy(desc(portalPostingReports.createdAt));
}

export async function countActiveReportsForPosting(postingId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: sql<number>`count(${portalPostingReports.id})::int` })
    .from(portalPostingReports)
    .where(
      and(
        eq(portalPostingReports.postingId, postingId),
        inArray(portalPostingReports.status, ["open", "investigating"]),
      ),
    );
  return result?.cnt ?? 0;
}

export async function listPostingsWithActiveReports(options: {
  limit: number;
  offset: number;
}): Promise<{ items: PostingWithReportCount[]; total: number }> {
  const { limit, offset } = options;

  // Priority computed from report count: <3 = normal, 3-4 = elevated, >=5 = urgent
  // ORDER BY priority DESC (urgent first), latestReportAt ASC (oldest first within tier)
  // TODO: consider materialized view or denormalized priority column if report volume exceeds 1000/month
  const reportCountExpr = sql<number>`count(${portalPostingReports.id})::int`;
  const priorityOrder = sql<number>`CASE
    WHEN count(${portalPostingReports.id}) >= 5 THEN 0
    WHEN count(${portalPostingReports.id}) >= 3 THEN 1
    ELSE 2
  END`;

  const [items, countRows] = await Promise.all([
    db
      .select({
        postingId: portalJobPostings.id,
        postingTitle: portalJobPostings.title,
        companyName: portalCompanyProfiles.name,
        companyId: portalCompanyProfiles.id,
        reportCount: reportCountExpr,
        latestReportAt: sql<Date>`max(${portalPostingReports.createdAt})`,
        priority: sql<PortalReportPriority>`CASE
          WHEN count(${portalPostingReports.id}) >= 5 THEN 'urgent'
          WHEN count(${portalPostingReports.id}) >= 3 THEN 'elevated'
          ELSE 'normal'
        END`,
      })
      .from(portalPostingReports)
      .innerJoin(portalJobPostings, eq(portalPostingReports.postingId, portalJobPostings.id))
      .innerJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
      .where(inArray(portalPostingReports.status, ["open", "investigating"]))
      .groupBy(portalJobPostings.id, portalCompanyProfiles.id)
      .orderBy(priorityOrder, sql`max(${portalPostingReports.createdAt}) ASC`, portalJobPostings.id)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(DISTINCT ${portalPostingReports.postingId})::int` })
      .from(portalPostingReports)
      .where(inArray(portalPostingReports.status, ["open", "investigating"])),
  ]);

  return { items: items as PostingWithReportCount[], total: countRows[0]?.total ?? 0 };
}

export async function resolveReportsForPosting(
  postingId: string,
  data: {
    resolvedByUserId: string;
    resolutionAction: string;
    resolutionNote: string;
  },
): Promise<number> {
  const updated = await db
    .update(portalPostingReports)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      resolvedByUserId: data.resolvedByUserId,
      resolutionAction: data.resolutionAction,
      resolutionNote: data.resolutionNote,
    })
    .where(
      and(
        eq(portalPostingReports.postingId, postingId),
        inArray(portalPostingReports.status, ["open", "investigating"]),
      ),
    )
    .returning({ id: portalPostingReports.id });
  return updated.length;
}

export async function dismissReportsForPosting(
  postingId: string,
  data: {
    resolvedByUserId: string;
    resolutionNote: string;
  },
): Promise<number> {
  const updated = await db
    .update(portalPostingReports)
    .set({
      status: "dismissed",
      resolvedAt: new Date(),
      resolvedByUserId: data.resolvedByUserId,
      resolutionAction: "dismiss",
      resolutionNote: data.resolutionNote,
    })
    .where(
      and(
        eq(portalPostingReports.postingId, postingId),
        inArray(portalPostingReports.status, ["open", "investigating"]),
      ),
    )
    .returning({ id: portalPostingReports.id });
  return updated.length;
}

export async function countActiveReportsForCompanyPostings(companyId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: sql<number>`count(${portalPostingReports.id})::int` })
    .from(portalPostingReports)
    .innerJoin(portalJobPostings, eq(portalPostingReports.postingId, portalJobPostings.id))
    .where(
      and(
        eq(portalJobPostings.companyId, companyId),
        inArray(portalPostingReports.status, ["open", "investigating"]),
      ),
    );
  return result?.cnt ?? 0;
}

export async function getReporterUserIdsForPosting(postingId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ reporterUserId: portalPostingReports.reporterUserId })
    .from(portalPostingReports)
    .where(
      and(
        eq(portalPostingReports.postingId, postingId),
        inArray(portalPostingReports.status, ["resolved", "dismissed"]),
      ),
    );
  return rows.map((r) => r.reporterUserId);
}
