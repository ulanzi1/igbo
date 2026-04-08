import "server-only";
import { db } from "../index";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { portalApplications } from "../schema/portal-applications";
import type {
  NewPortalJobPosting,
  PortalJobPosting,
  PortalJobStatus,
} from "../schema/portal-job-postings";
import type { PortalCompanyProfile } from "../schema/portal-company-profiles";
import { eq, desc, and, count, isNull, isNotNull, lte, gt, sql, inArray } from "drizzle-orm";

export async function createJobPosting(data: NewPortalJobPosting): Promise<PortalJobPosting> {
  const [posting] = await db.insert(portalJobPostings).values(data).returning();
  if (!posting) throw new Error("Failed to create job posting");
  return posting;
}

export async function getJobPostingById(id: string): Promise<PortalJobPosting | null> {
  const [posting] = await db
    .select()
    .from(portalJobPostings)
    .where(eq(portalJobPostings.id, id))
    .limit(1);
  return posting ?? null;
}

export async function getJobPostingsByCompanyId(companyId: string): Promise<PortalJobPosting[]> {
  return db
    .select()
    .from(portalJobPostings)
    .where(eq(portalJobPostings.companyId, companyId))
    .orderBy(desc(portalJobPostings.createdAt));
}

export async function getJobPostingsByCompanyIdWithFilter(
  companyId: string,
  statusFilter?: PortalJobStatus | "archived",
): Promise<PortalJobPosting[]> {
  if (statusFilter === "archived") {
    // "archived" is not a DB status — it maps to WHERE archived_at IS NOT NULL
    return db
      .select()
      .from(portalJobPostings)
      .where(
        and(eq(portalJobPostings.companyId, companyId), isNotNull(portalJobPostings.archivedAt)),
      )
      .orderBy(desc(portalJobPostings.createdAt));
  }
  if (statusFilter !== undefined) {
    return db
      .select()
      .from(portalJobPostings)
      .where(
        and(
          eq(portalJobPostings.companyId, companyId),
          eq(portalJobPostings.status, statusFilter),
          isNull(portalJobPostings.archivedAt),
        ),
      )
      .orderBy(desc(portalJobPostings.createdAt));
  }
  // Default: exclude archived postings
  return db
    .select()
    .from(portalJobPostings)
    .where(and(eq(portalJobPostings.companyId, companyId), isNull(portalJobPostings.archivedAt)))
    .orderBy(desc(portalJobPostings.createdAt));
}

export async function getJobPostingWithCompany(
  postingId: string,
): Promise<{ posting: PortalJobPosting; company: PortalCompanyProfile } | null> {
  const [row] = await db
    .select({
      posting: portalJobPostings,
      company: portalCompanyProfiles,
    })
    .from(portalJobPostings)
    .innerJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .where(eq(portalJobPostings.id, postingId))
    .limit(1);
  return row ?? null;
}

export async function countActivePostingsByCompanyId(companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(portalJobPostings)
    .where(and(eq(portalJobPostings.companyId, companyId), eq(portalJobPostings.status, "active")));
  return row?.count ?? 0;
}

export async function updateJobPosting(
  id: string,
  data: Partial<Omit<NewPortalJobPosting, "id" | "createdAt">>,
): Promise<PortalJobPosting | null> {
  const [updated] = await db
    .update(portalJobPostings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(portalJobPostings.id, id))
    .returning();
  return updated ?? null;
}

/**
 * Returns active postings whose expires_at is in the past (ready to expire).
 */
export async function getExpiredPostings(): Promise<PortalJobPosting[]> {
  return db
    .select()
    .from(portalJobPostings)
    .where(
      and(
        eq(portalJobPostings.status, "active"),
        isNotNull(portalJobPostings.expiresAt),
        lte(portalJobPostings.expiresAt, sql`NOW()`),
      ),
    );
}

/**
 * Returns active postings expiring within the given number of days (for warning events).
 */
export async function getExpiringPostings(withinDays: number): Promise<PortalJobPosting[]> {
  return db
    .select()
    .from(portalJobPostings)
    .where(
      and(
        eq(portalJobPostings.status, "active"),
        isNotNull(portalJobPostings.expiresAt),
        gt(portalJobPostings.expiresAt, sql`NOW()`),
        lte(portalJobPostings.expiresAt, sql`NOW() + (INTERVAL '1 day' * ${withinDays})`),
      ),
    );
}

/**
 * Returns expired postings that have been in expired status beyond the grace period
 * and have not yet been archived.
 */
export async function getArchivablePostings(gracePeriodDays: number): Promise<PortalJobPosting[]> {
  return db
    .select()
    .from(portalJobPostings)
    .where(
      and(
        eq(portalJobPostings.status, "expired"),
        isNull(portalJobPostings.archivedAt),
        isNotNull(portalJobPostings.expiresAt),
        lte(portalJobPostings.expiresAt, sql`NOW() - (INTERVAL '1 day' * ${gracePeriodDays})`),
      ),
    );
}

/**
 * Soft-archives a single expired posting by setting archived_at = NOW().
 * Returns the number of rows updated (0 if already archived or not found).
 */
export async function archivePosting(id: string): Promise<number> {
  const result = await db
    .update(portalJobPostings)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(portalJobPostings.id, id),
        eq(portalJobPostings.status, "expired"),
        isNull(portalJobPostings.archivedAt),
      ),
    )
    .returning({ id: portalJobPostings.id });
  return result.length;
}

/**
 * Batch-expires active postings by ID. Returns the number of rows updated.
 */
export async function batchExpirePostings(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db
    .update(portalJobPostings)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(inArray(portalJobPostings.id, ids), eq(portalJobPostings.status, "active")))
    .returning({ id: portalJobPostings.id });
  return result.length;
}

export async function updateJobPostingStatus(
  id: string,
  status: PortalJobStatus,
): Promise<PortalJobPosting | null> {
  const [updated] = await db
    .update(portalJobPostings)
    .set({ status, updatedAt: new Date() })
    .where(eq(portalJobPostings.id, id))
    .returning();
  return updated ?? null;
}

/**
 * Atomically increments view_count for a posting.
 * Returns the updated viewCount, or null if not found.
 */
export async function incrementViewCount(jobId: string): Promise<number | null> {
  const [updated] = await db
    .update(portalJobPostings)
    .set({ viewCount: sql`${portalJobPostings.viewCount} + 1` })
    .where(eq(portalJobPostings.id, jobId))
    .returning({ viewCount: portalJobPostings.viewCount });
  return updated?.viewCount ?? null;
}

export interface JobAnalyticsData {
  viewCount: number;
  applicationCount: number;
  conversionRate: number;
  communityPostId: string | null;
}

/**
 * Returns analytics for a job posting: view count, application count, conversion rate.
 * Returns null if the posting is not found.
 */
export async function getJobAnalytics(jobId: string): Promise<JobAnalyticsData | null> {
  const [posting] = await db
    .select({
      viewCount: portalJobPostings.viewCount,
      communityPostId: portalJobPostings.communityPostId,
    })
    .from(portalJobPostings)
    .where(eq(portalJobPostings.id, jobId))
    .limit(1);

  if (!posting) return null;

  const [appRow] = await db
    .select({ count: count() })
    .from(portalApplications)
    .where(eq(portalApplications.jobId, jobId));

  const applicationCount = appRow?.count ?? 0;
  const conversionRate =
    posting.viewCount === 0 ? 0 : Math.round((applicationCount / posting.viewCount) * 1000) / 10; // 1 decimal place

  return {
    viewCount: posting.viewCount,
    applicationCount,
    conversionRate,
    communityPostId: posting.communityPostId ?? null,
  };
}

/**
 * Sets community_post_id on a posting — idempotent.
 * Uses WHERE community_post_id IS NULL so a second call returns null (already shared).
 * Returns updated posting, or null if already shared or not found.
 */
export async function markSharedToCommunity(
  jobId: string,
  communityPostId: string,
): Promise<PortalJobPosting | null> {
  const [updated] = await db
    .update(portalJobPostings)
    .set({ communityPostId, updatedAt: new Date() })
    .where(and(eq(portalJobPostings.id, jobId), isNull(portalJobPostings.communityPostId)))
    .returning();
  return updated ?? null;
}

/**
 * Lightweight projection for the job application submission service.
 * Returns only the fields needed to validate preconditions and build event payloads.
 * Returns null if the posting does not exist or has no associated company profile.
 */
export async function getJobPostingForApply(jobId: string): Promise<{
  id: string;
  status: PortalJobStatus;
  applicationDeadline: Date | null;
  enableCoverLetter: boolean;
  companyId: string;
  employerUserId: string;
} | null> {
  const [row] = await db
    .select({
      id: portalJobPostings.id,
      status: portalJobPostings.status,
      applicationDeadline: portalJobPostings.applicationDeadline,
      enableCoverLetter: portalJobPostings.enableCoverLetter,
      companyId: portalJobPostings.companyId,
      employerUserId: portalCompanyProfiles.ownerUserId,
    })
    .from(portalJobPostings)
    .innerJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .where(eq(portalJobPostings.id, jobId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    applicationDeadline: row.applicationDeadline ?? null,
    enableCoverLetter: row.enableCoverLetter,
    companyId: row.companyId,
    employerUserId: row.employerUserId,
  };
}

/**
 * Returns the communityPostId for a posting (null if not yet shared).
 * Returns undefined if the posting does not exist.
 */
export async function getJobPostingShareStatus(jobId: string): Promise<string | null | undefined> {
  const [row] = await db
    .select({ communityPostId: portalJobPostings.communityPostId })
    .from(portalJobPostings)
    .where(eq(portalJobPostings.id, jobId))
    .limit(1);
  if (!row) return undefined;
  return row.communityPostId ?? null;
}
