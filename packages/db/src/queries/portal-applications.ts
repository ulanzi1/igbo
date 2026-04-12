import "server-only";
import { db } from "../index";
import { portalApplications, portalApplicationTransitions } from "../schema/portal-applications";
import type {
  NewPortalApplication,
  PortalApplication,
  PortalApplicationStatus,
  NewPortalApplicationTransition,
  PortalApplicationTransition,
} from "../schema/portal-applications";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { portalSeekerCvs } from "../schema/portal-seeker-cvs";
import { portalSeekerProfiles } from "../schema/portal-seeker-profiles";
import { authUsers } from "../schema/auth-users";
import { platformFileUploads } from "../schema/file-uploads";
import { eq, desc, asc, and, ne, count, inArray } from "drizzle-orm";

export async function createApplication(data: NewPortalApplication): Promise<PortalApplication> {
  const [application] = await db.insert(portalApplications).values(data).returning();
  if (!application) throw new Error("Failed to create application");
  return application;
}

export async function getApplicationsByJobId(jobId: string): Promise<PortalApplication[]> {
  return db
    .select()
    .from(portalApplications)
    .where(eq(portalApplications.jobId, jobId))
    .orderBy(desc(portalApplications.createdAt));
}

export async function getApplicationsBySeekerId(
  seekerUserId: string,
): Promise<PortalApplication[]> {
  return db
    .select()
    .from(portalApplications)
    .where(eq(portalApplications.seekerUserId, seekerUserId))
    .orderBy(desc(portalApplications.createdAt));
}

/**
 * Returns the application with its current status plus companyId from the job posting.
 * Used by the state machine service to build event payloads.
 * Returns null if the application does not exist.
 */
export async function getApplicationWithCurrentStatus(applicationId: string): Promise<{
  id: string;
  status: PortalApplicationStatus;
  jobId: string;
  seekerUserId: string;
  companyId: string;
} | null> {
  const rows = await db
    .select({
      id: portalApplications.id,
      status: portalApplications.status,
      jobId: portalApplications.jobId,
      seekerUserId: portalApplications.seekerUserId,
      companyId: portalJobPostings.companyId,
    })
    .from(portalApplications)
    .leftJoin(portalJobPostings, eq(portalApplications.jobId, portalJobPostings.id))
    .where(eq(portalApplications.id, applicationId));

  const row = rows[0];
  if (!row || !row.companyId) return null;
  return {
    id: row.id,
    status: row.status,
    jobId: row.jobId,
    seekerUserId: row.seekerUserId,
    companyId: row.companyId,
  };
}

/**
 * Updates application status with full audit fields.
 *
 * @deprecated Do NOT call directly for status transitions — use
 * `ApplicationStateMachine.transition()` (AC-6). This function bypasses
 * transition validation, audit trail insertion, and event emission.
 * Retained for potential non-transition updates (e.g., data migrations).
 */
export async function updateApplicationStatus(
  id: string,
  status: PortalApplicationStatus,
  previousStatus?: PortalApplicationStatus,
  transitionedByUserId?: string,
  transitionReason?: string,
): Promise<PortalApplication | null> {
  const [updated] = await db
    .update(portalApplications)
    .set({
      status,
      previousStatus: previousStatus ?? null,
      transitionedAt: new Date(),
      transitionedByUserId: transitionedByUserId ?? null,
      transitionReason: transitionReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(portalApplications.id, id))
    .returning();
  return updated ?? null;
}

/**
 * Inserts a transition row into the audit trail.
 * Called inside a db.transaction by ApplicationStateMachine.
 */
export async function insertTransition(
  data: NewPortalApplicationTransition,
): Promise<PortalApplicationTransition> {
  const [transition] = await db.insert(portalApplicationTransitions).values(data).returning();
  if (!transition) throw new Error("Failed to insert transition");
  return transition;
}

/**
 * Returns the full chronological transition history for an application.
 */
export async function getTransitionHistory(
  applicationId: string,
): Promise<PortalApplicationTransition[]> {
  return db
    .select()
    .from(portalApplicationTransitions)
    .where(eq(portalApplicationTransitions.applicationId, applicationId))
    .orderBy(asc(portalApplicationTransitions.createdAt));
}

/**
 * Inserts a new application row with the full P-2.5A submission payload.
 * Explicit typed parameters prevent callers from accidentally omitting
 * `portfolioLinksJson` or passing unsanitised data.
 * Does NOT handle idempotency — that is the service's responsibility.
 */
export async function insertApplicationWithPayload(data: {
  jobId: string;
  seekerUserId: string;
  selectedCvId: string | null;
  coverLetterText: string | null;
  portfolioLinks: string[];
}): Promise<PortalApplication> {
  const [application] = await db
    .insert(portalApplications)
    .values({
      jobId: data.jobId,
      seekerUserId: data.seekerUserId,
      selectedCvId: data.selectedCvId,
      coverLetterText: data.coverLetterText,
      portfolioLinksJson: data.portfolioLinks,
    })
    .returning();
  if (!application) throw new Error("Failed to insert application");
  return application;
}

/**
 * Returns the single non-withdrawn application for (jobId, seekerUserId), or null.
 * Used by the idempotent-replay lookup path: when an Idempotency-Key hits a
 * cached Redis key, look up the existing row rather than creating a new one.
 */
export async function getExistingActiveApplication(
  jobId: string,
  seekerUserId: string,
): Promise<PortalApplication | null> {
  const [application] = await db
    .select()
    .from(portalApplications)
    .where(
      and(
        eq(portalApplications.jobId, jobId),
        eq(portalApplications.seekerUserId, seekerUserId),
        ne(portalApplications.status, "withdrawn"),
      ),
    )
    .limit(1);
  return application ?? null;
}

/**
 * Returns enriched application list for a seeker, joining with job postings
 * and company profiles to surface job title and company name.
 * Ordered by updatedAt DESC (most recently updated first).
 */
export async function getApplicationsWithJobDataBySeekerId(seekerUserId: string): Promise<
  Array<{
    id: string;
    jobId: string;
    status: PortalApplicationStatus;
    createdAt: Date;
    updatedAt: Date;
    transitionedAt: Date | null;
    jobTitle: string | null;
    companyId: string | null;
    companyName: string | null;
  }>
> {
  return db
    .select({
      id: portalApplications.id,
      jobId: portalApplications.jobId,
      status: portalApplications.status,
      createdAt: portalApplications.createdAt,
      updatedAt: portalApplications.updatedAt,
      transitionedAt: portalApplications.transitionedAt,
      jobTitle: portalJobPostings.title,
      companyId: portalJobPostings.companyId,
      companyName: portalCompanyProfiles.name,
    })
    .from(portalApplications)
    .leftJoin(portalJobPostings, eq(portalApplications.jobId, portalJobPostings.id))
    .leftJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .where(eq(portalApplications.seekerUserId, seekerUserId))
    .orderBy(desc(portalApplications.updatedAt));
}

/**
 * Returns a full application with job posting data, company name, and CV label
 * for the detail view. Scoped to the owning seeker — returns null if the
 * application does not exist or belongs to a different seeker.
 *
 * Uses LEFT JOIN for portal_seeker_cvs because selectedCvId is nullable;
 * an INNER JOIN would silently drop applications with no CV selected.
 */
export async function getApplicationDetailForSeeker(
  applicationId: string,
  seekerUserId: string,
): Promise<{
  id: string;
  jobId: string;
  seekerUserId: string;
  status: PortalApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
  coverLetterText: string | null;
  portfolioLinksJson: string[];
  selectedCvId: string | null;
  jobTitle: string | null;
  companyId: string | null;
  companyName: string | null;
  cvLabel: string | null;
} | null> {
  const rows = await db
    .select({
      id: portalApplications.id,
      jobId: portalApplications.jobId,
      seekerUserId: portalApplications.seekerUserId,
      status: portalApplications.status,
      createdAt: portalApplications.createdAt,
      updatedAt: portalApplications.updatedAt,
      coverLetterText: portalApplications.coverLetterText,
      portfolioLinksJson: portalApplications.portfolioLinksJson,
      selectedCvId: portalApplications.selectedCvId,
      jobTitle: portalJobPostings.title,
      companyId: portalJobPostings.companyId,
      companyName: portalCompanyProfiles.name,
      cvLabel: portalSeekerCvs.label,
    })
    .from(portalApplications)
    .leftJoin(portalJobPostings, eq(portalApplications.jobId, portalJobPostings.id))
    .leftJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .leftJoin(portalSeekerCvs, eq(portalApplications.selectedCvId, portalSeekerCvs.id))
    .where(
      and(
        eq(portalApplications.id, applicationId),
        eq(portalApplications.seekerUserId, seekerUserId),
      ),
    );

  return rows[0] ?? null;
}

/**
 * Returns a count of applications grouped by status for a given seeker.
 * Used by the seeker analytics dashboard.
 * Origin: P-2.8
 */
export async function getApplicationCountsByStatusForSeeker(
  seekerUserId: string,
): Promise<Array<{ status: string; count: number }>> {
  const rows = await db
    .select({
      status: portalApplications.status,
      count: count(),
    })
    .from(portalApplications)
    .where(eq(portalApplications.seekerUserId, seekerUserId))
    .groupBy(portalApplications.status);

  return rows.map((row) => ({ status: row.status, count: row.count }));
}

// ─── P-2.10 additions ─────────────────────────────────────────────────────────

/**
 * Batch ownership verification for the bulk status route.
 * Returns applications whose id is in `ids` AND whose job belongs to
 * `companyId`. If the returned array length < `ids.length`, at least one
 * id does not belong to this company — callers treat mismatch as 404
 * (fail-closed) to avoid leaking which specific IDs failed validation.
 *
 * Used by PATCH /api/v1/applications/bulk/status. Inner join on
 * `portal_job_postings` enforces the company scope in a single query
 * rather than N individual getApplicationWithCurrentStatus calls.
 * Origin: P-2.10
 */
export async function getApplicationsByIds(
  ids: string[],
  companyId: string,
): Promise<
  Array<{
    id: string;
    status: PortalApplicationStatus;
    jobId: string;
    seekerUserId: string;
    companyId: string;
  }>
> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: portalApplications.id,
      status: portalApplications.status,
      jobId: portalApplications.jobId,
      seekerUserId: portalApplications.seekerUserId,
      companyId: portalJobPostings.companyId,
    })
    .from(portalApplications)
    .innerJoin(portalJobPostings, eq(portalApplications.jobId, portalJobPostings.id))
    .where(and(inArray(portalApplications.id, ids), eq(portalJobPostings.companyId, companyId)));
  return rows;
}

// ─── P-2.9 additions ──────────────────────────────────────────────────────────

/**
 * Returns all applications for a given job, enriched with seeker profile
 * summary (name, headline, seekerProfileId, skills) and application payload
 * fields (coverLetterText, portfolioLinksJson, selectedCvId).
 *
 * Uses LEFT JOIN for both seeker_profiles and auth_users so applications
 * with missing joins are never silently dropped. Ordered by createdAt DESC
 * so new applications surface at the top of each column.
 */
export async function getApplicationsWithSeekerDataByJobId(jobId: string): Promise<
  Array<{
    id: string;
    jobId: string;
    seekerUserId: string;
    status: PortalApplicationStatus;
    createdAt: Date;
    updatedAt: Date;
    coverLetterText: string | null;
    portfolioLinksJson: string[];
    selectedCvId: string | null;
    seekerName: string | null;
    seekerHeadline: string | null;
    seekerProfileId: string | null;
    seekerSkills: string[];
  }>
> {
  const rows = await db
    .select({
      id: portalApplications.id,
      jobId: portalApplications.jobId,
      seekerUserId: portalApplications.seekerUserId,
      status: portalApplications.status,
      createdAt: portalApplications.createdAt,
      updatedAt: portalApplications.updatedAt,
      coverLetterText: portalApplications.coverLetterText,
      portfolioLinksJson: portalApplications.portfolioLinksJson,
      selectedCvId: portalApplications.selectedCvId,
      seekerName: authUsers.name,
      seekerHeadline: portalSeekerProfiles.headline,
      seekerProfileId: portalSeekerProfiles.id,
      seekerSkills: portalSeekerProfiles.skills,
    })
    .from(portalApplications)
    .leftJoin(authUsers, eq(portalApplications.seekerUserId, authUsers.id))
    .leftJoin(
      portalSeekerProfiles,
      eq(portalApplications.seekerUserId, portalSeekerProfiles.userId),
    )
    .where(eq(portalApplications.jobId, jobId))
    .orderBy(desc(portalApplications.createdAt));

  return rows.map((row) => ({
    ...row,
    portfolioLinksJson: (row.portfolioLinksJson ?? []) as string[],
    seekerSkills: (row.seekerSkills ?? []) as string[],
  }));
}

/**
 * Returns a full application detail row scoped by the owning company's id
 * (via the job_postings join). Returns null when the application does not
 * exist or when the company does not own the job — enforcing the
 * 404-not-403 information-leak policy (caller returns 404 on null).
 *
 * The `cvProcessedUrl` is the public/pre-signed S3 object URL stored at
 * CV upload time and is rendered directly as the "Download Resume" href.
 */
export async function getApplicationDetailForEmployer(
  applicationId: string,
  companyId: string,
): Promise<{
  id: string;
  jobId: string;
  seekerUserId: string;
  status: PortalApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
  coverLetterText: string | null;
  portfolioLinksJson: string[];
  selectedCvId: string | null;
  jobTitle: string | null;
  companyId: string | null;
  seekerName: string | null;
  seekerHeadline: string | null;
  seekerProfileId: string | null;
  seekerSummary: string | null;
  seekerSkills: string[];
  cvId: string | null;
  cvLabel: string | null;
  cvProcessedUrl: string | null;
} | null> {
  const rows = await db
    .select({
      id: portalApplications.id,
      jobId: portalApplications.jobId,
      seekerUserId: portalApplications.seekerUserId,
      status: portalApplications.status,
      createdAt: portalApplications.createdAt,
      updatedAt: portalApplications.updatedAt,
      coverLetterText: portalApplications.coverLetterText,
      portfolioLinksJson: portalApplications.portfolioLinksJson,
      selectedCvId: portalApplications.selectedCvId,
      jobTitle: portalJobPostings.title,
      companyId: portalJobPostings.companyId,
      seekerName: authUsers.name,
      seekerHeadline: portalSeekerProfiles.headline,
      seekerProfileId: portalSeekerProfiles.id,
      seekerSummary: portalSeekerProfiles.summary,
      seekerSkills: portalSeekerProfiles.skills,
      cvId: portalSeekerCvs.id,
      cvLabel: portalSeekerCvs.label,
      cvProcessedUrl: platformFileUploads.processedUrl,
    })
    .from(portalApplications)
    .leftJoin(portalJobPostings, eq(portalApplications.jobId, portalJobPostings.id))
    .leftJoin(authUsers, eq(portalApplications.seekerUserId, authUsers.id))
    .leftJoin(
      portalSeekerProfiles,
      eq(portalApplications.seekerUserId, portalSeekerProfiles.userId),
    )
    .leftJoin(portalSeekerCvs, eq(portalApplications.selectedCvId, portalSeekerCvs.id))
    .leftJoin(platformFileUploads, eq(portalSeekerCvs.fileUploadId, platformFileUploads.id))
    .where(
      and(eq(portalApplications.id, applicationId), eq(portalJobPostings.companyId, companyId)),
    );

  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    portfolioLinksJson: (row.portfolioLinksJson ?? []) as string[],
    seekerSkills: (row.seekerSkills ?? []) as string[],
  };
}

/**
 * Returns all applications for a given job scoped to the owning company,
 * with the minimal fields needed for CSV export: seeker name, email (for
 * consent check), headline, status, applied date, last status change date,
 * and the consent flag.
 *
 * The INNER JOIN on portalJobPostings ensures that if the job does not
 * belong to `companyId`, zero rows are returned (not an error). Callers
 * must verify ownership separately (getJobPostingWithCompany) to distinguish
 * "no applicants" from "not owned".
 *
 * Ordered by createdAt ASC (chronological for CSV readability).
 */
export async function getApplicationsForExport(
  jobId: string,
  companyId: string,
): Promise<
  Array<{
    seekerName: string | null;
    seekerEmail: string | null;
    seekerHeadline: string | null;
    status: PortalApplicationStatus;
    createdAt: Date;
    transitionedAt: Date | null;
    consentEmployerView: boolean | null;
  }>
> {
  return db
    .select({
      seekerName: authUsers.name,
      seekerEmail: authUsers.email,
      seekerHeadline: portalSeekerProfiles.headline,
      status: portalApplications.status,
      createdAt: portalApplications.createdAt,
      transitionedAt: portalApplications.transitionedAt,
      consentEmployerView: portalSeekerProfiles.consentEmployerView,
    })
    .from(portalApplications)
    .innerJoin(
      portalJobPostings,
      and(
        eq(portalApplications.jobId, portalJobPostings.id),
        eq(portalJobPostings.companyId, companyId),
      ),
    )
    .leftJoin(authUsers, eq(portalApplications.seekerUserId, authUsers.id))
    .leftJoin(
      portalSeekerProfiles,
      eq(portalApplications.seekerUserId, portalSeekerProfiles.userId),
    )
    .where(eq(portalApplications.jobId, jobId))
    .orderBy(asc(portalApplications.createdAt));
}
