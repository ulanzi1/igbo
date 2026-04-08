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
import { eq, desc, asc } from "drizzle-orm";

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
