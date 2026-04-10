import "server-only";
import { db } from "../index";
import { portalApplications, portalApplicationTransitions } from "../schema/portal-applications";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { portalSeekerProfiles } from "../schema/portal-seeker-profiles";
import { portalSeekerCvs } from "../schema/portal-seeker-cvs";
import { platformFileUploads } from "../schema/file-uploads";
import { authUsers } from "../schema/auth-users";
import type {
  NewPortalApplication,
  PortalApplication,
  PortalApplicationStatus,
  PortalApplicationTransition,
  NewPortalApplicationTransition,
} from "../schema/portal-applications";
import { eq, desc, asc, and, ne } from "drizzle-orm";

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
 * `ApplicationStateMachine.transition()`. This bypasses validation and audit trail.
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
 * Returns the single non-withdrawn application for (jobId, seekerUserId), or null.
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
 */
export async function getApplicationsWithJobDataBySeekerId(seekerUserId: string) {
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
 * Returns all applications for a job posting, enriched with seeker profile data.
 * Used by the employer ATS pipeline view.
 */
export async function getApplicationsWithSeekerDataByJobId(jobId: string) {
  return db
    .select({
      id: portalApplications.id,
      status: portalApplications.status,
      createdAt: portalApplications.createdAt,
      coverLetterText: portalApplications.coverLetterText,
      portfolioLinksJson: portalApplications.portfolioLinksJson,
      selectedCvId: portalApplications.selectedCvId,
      seekerName: authUsers.name,
      seekerProfileId: portalSeekerProfiles.id,
      seekerHeadline: portalSeekerProfiles.headline,
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
}

/**
 * Returns a full application detail for the employer, including seeker profile data.
 * Scoped to the owning company — returns null if not found or not owned by this company.
 */
export async function getApplicationDetailForEmployer(
  applicationId: string,
  companyId: string,
): Promise<{
  id: string;
  seekerUserId: string;
  status: PortalApplicationStatus;
  coverLetterText: string | null;
  portfolioLinksJson: string[];
  seekerName: string | null;
  seekerHeadline: string | null;
  seekerSkills: string[];
  seekerSummary: string | null;
  cvLabel: string | null;
  cvProcessedUrl: string | null;
} | null> {
  const rows = await db
    .select({
      id: portalApplications.id,
      seekerUserId: portalApplications.seekerUserId,
      status: portalApplications.status,
      coverLetterText: portalApplications.coverLetterText,
      portfolioLinksJson: portalApplications.portfolioLinksJson,
      seekerName: authUsers.name,
      seekerHeadline: portalSeekerProfiles.headline,
      seekerSkills: portalSeekerProfiles.skills,
      seekerSummary: portalSeekerProfiles.summary,
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
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    seekerUserId: row.seekerUserId,
    status: row.status,
    coverLetterText: row.coverLetterText,
    portfolioLinksJson: (row.portfolioLinksJson as string[]) ?? [],
    seekerName: row.seekerName ?? null,
    seekerHeadline: row.seekerHeadline ?? null,
    seekerSkills: row.seekerSkills ?? [],
    seekerSummary: row.seekerSummary ?? null,
    cvLabel: row.cvLabel ?? null,
    cvProcessedUrl: row.cvProcessedUrl ?? null,
  };
}
