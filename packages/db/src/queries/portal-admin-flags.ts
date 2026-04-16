import "server-only";
import { db } from "../index";
import { portalAdminFlags } from "../schema/portal-admin-flags";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import type { PortalAdminFlag, NewPortalAdminFlag } from "../schema/portal-admin-flags";
import { eq, and, gte, sql, ne } from "drizzle-orm";

export type { PortalAdminFlag, NewPortalAdminFlag };

export interface OpenFlagWithContext extends PortalAdminFlag {
  postingTitle: string;
  companyName: string;
  companyId: string;
}

export async function insertAdminFlag(data: NewPortalAdminFlag): Promise<PortalAdminFlag> {
  const [inserted] = await db.insert(portalAdminFlags).values(data).returning();
  if (!inserted) throw new Error("insertAdminFlag: no row returned");
  return inserted;
}

export async function getAdminFlagById(flagId: string): Promise<PortalAdminFlag | null> {
  const [row] = await db
    .select()
    .from(portalAdminFlags)
    .where(eq(portalAdminFlags.id, flagId))
    .limit(1);
  return row ?? null;
}

export async function getOpenFlagForPosting(postingId: string): Promise<PortalAdminFlag | null> {
  const [row] = await db
    .select()
    .from(portalAdminFlags)
    .where(and(eq(portalAdminFlags.postingId, postingId), eq(portalAdminFlags.status, "open")))
    .limit(1);
  return row ?? null;
}

export async function getFlagsForPosting(postingId: string): Promise<PortalAdminFlag[]> {
  return db
    .select()
    .from(portalAdminFlags)
    .where(eq(portalAdminFlags.postingId, postingId))
    .orderBy(portalAdminFlags.createdAt);
}

export async function listOpenFlags(options: {
  limit: number;
  offset: number;
  companyId?: string;
}): Promise<{ items: OpenFlagWithContext[]; total: number }> {
  const { limit, offset, companyId } = options;

  // Severity ordering: high=0, medium=1, low=2
  const severityOrder = sql<number>`CASE ${portalAdminFlags.severity}
    WHEN 'high' THEN 0
    WHEN 'medium' THEN 1
    ELSE 2
  END`;

  const whereCondition = and(
    eq(portalAdminFlags.status, "open"),
    companyId ? eq(portalJobPostings.companyId, companyId) : undefined,
  );

  const [items, countRows] = await Promise.all([
    db
      .select({
        id: portalAdminFlags.id,
        postingId: portalAdminFlags.postingId,
        adminUserId: portalAdminFlags.adminUserId,
        category: portalAdminFlags.category,
        severity: portalAdminFlags.severity,
        description: portalAdminFlags.description,
        status: portalAdminFlags.status,
        autoPaused: portalAdminFlags.autoPaused,
        resolvedAt: portalAdminFlags.resolvedAt,
        resolvedByUserId: portalAdminFlags.resolvedByUserId,
        resolutionAction: portalAdminFlags.resolutionAction,
        resolutionNote: portalAdminFlags.resolutionNote,
        createdAt: portalAdminFlags.createdAt,
        postingTitle: portalJobPostings.title,
        companyName: portalCompanyProfiles.name,
        companyId: portalCompanyProfiles.id,
      })
      .from(portalAdminFlags)
      .innerJoin(portalJobPostings, eq(portalAdminFlags.postingId, portalJobPostings.id))
      .innerJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
      .where(whereCondition)
      .orderBy(severityOrder, portalAdminFlags.createdAt, portalAdminFlags.id)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(portalAdminFlags)
      .innerJoin(portalJobPostings, eq(portalAdminFlags.postingId, portalJobPostings.id))
      .where(whereCondition),
  ]);

  return { items: items as OpenFlagWithContext[], total: countRows[0]?.total ?? 0 };
}

export async function resolveAdminFlag(
  flagId: string,
  data: {
    resolvedByUserId: string;
    resolutionAction: string;
    resolutionNote: string;
  },
): Promise<PortalAdminFlag | null> {
  const [updated] = await db
    .update(portalAdminFlags)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      resolvedByUserId: data.resolvedByUserId,
      resolutionAction: data.resolutionAction,
      resolutionNote: data.resolutionNote,
    })
    .where(and(eq(portalAdminFlags.id, flagId), eq(portalAdminFlags.status, "open")))
    .returning();
  return updated ?? null;
}

export async function dismissAdminFlag(
  flagId: string,
  data: {
    resolvedByUserId: string;
    resolutionNote: string;
  },
): Promise<PortalAdminFlag | null> {
  const [updated] = await db
    .update(portalAdminFlags)
    .set({
      status: "dismissed",
      resolvedAt: new Date(),
      resolvedByUserId: data.resolvedByUserId,
      resolutionAction: "dismiss",
      resolutionNote: data.resolutionNote,
    })
    .where(and(eq(portalAdminFlags.id, flagId), eq(portalAdminFlags.status, "open")))
    .returning();
  return updated ?? null;
}

export async function countOpenViolationsForCompany(companyId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(portalAdminFlags)
    .innerJoin(portalJobPostings, eq(portalAdminFlags.postingId, portalJobPostings.id))
    .where(and(eq(portalJobPostings.companyId, companyId), eq(portalAdminFlags.status, "open")));
  return result?.cnt ?? 0;
}

export async function countRecentViolationsForCompany(
  companyId: string,
  since: Date,
): Promise<number> {
  // Non-dismissed flags (open or resolved) in the given window
  const [result] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(portalAdminFlags)
    .innerJoin(portalJobPostings, eq(portalAdminFlags.postingId, portalJobPostings.id))
    .where(
      and(
        eq(portalJobPostings.companyId, companyId),
        ne(portalAdminFlags.status, "dismissed"),
        gte(portalAdminFlags.createdAt, since),
      ),
    );
  return result?.cnt ?? 0;
}
