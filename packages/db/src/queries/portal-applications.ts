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
import { eq, desc, asc, and, ne, count } from "drizzle-orm";

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
