import "server-only";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  getApplicationWithCurrentStatus,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";
import {
  portalApplications,
  portalApplicationTransitions,
} from "@igbo/db/schema/portal-applications";
import type { PortalApplicationStatus, PortalActorRole } from "@igbo/db/schema/portal-applications";
import type { PortalJobStatus } from "@igbo/db/schema/portal-job-postings";
import { eq } from "drizzle-orm";
import { db } from "@igbo/db";
import { portalEventBus } from "@/services/event-bus";

// ---------------------------------------------------------------------------
// PREP-A terminal state constants (inline until PR #26 merges)
// TODO: import from @igbo/db when PREP-A merges (PR #26)
// ---------------------------------------------------------------------------
const APPLICATION_TERMINAL_STATES = ["hired", "rejected", "withdrawn"] as const;
export type ApplicationTerminalStatus = (typeof APPLICATION_TERMINAL_STATES)[number];

function isTerminalApplicationStatus(status: PortalApplicationStatus): boolean {
  return (APPLICATION_TERMINAL_STATES as readonly string[]).includes(status);
}

/**
 * Checks whether a job posting in this status can accept new applications.
 * Exported for P-2.5A to call before creating the initial application.
 */
export function canAcceptApplications(jobStatus: PortalJobStatus): boolean {
  return jobStatus === "active";
}

// ---------------------------------------------------------------------------
// Valid transitions map
// Key: fromStatus, Value: list of { toStatus, allowedActors }
// ---------------------------------------------------------------------------
export interface TransitionRule {
  toStatus: PortalApplicationStatus;
  allowedActors: PortalActorRole[];
}

/**
 * Exported for P-2.10 bulk status route: `getNextAdvanceStatus()` needs to
 * introspect the map to compute the next valid forward transition for each
 * application. VALID_TRANSITIONS is the server-authoritative source — do
 * NOT import client-side EMPLOYER_TRANSITIONS from the kanban board.
 */
export const VALID_TRANSITIONS: Record<PortalApplicationStatus, TransitionRule[]> = {
  submitted: [
    { toStatus: "under_review", allowedActors: ["employer"] },
    { toStatus: "rejected", allowedActors: ["employer"] },
    { toStatus: "withdrawn", allowedActors: ["job_seeker"] },
  ],
  under_review: [
    { toStatus: "shortlisted", allowedActors: ["employer"] },
    { toStatus: "rejected", allowedActors: ["employer"] },
    { toStatus: "withdrawn", allowedActors: ["job_seeker"] },
  ],
  shortlisted: [
    { toStatus: "interview", allowedActors: ["employer"] },
    { toStatus: "rejected", allowedActors: ["employer"] },
    { toStatus: "withdrawn", allowedActors: ["job_seeker"] },
  ],
  interview: [
    { toStatus: "offered", allowedActors: ["employer"] },
    { toStatus: "rejected", allowedActors: ["employer"] },
    { toStatus: "withdrawn", allowedActors: ["job_seeker"] },
  ],
  offered: [
    { toStatus: "hired", allowedActors: ["employer"] },
    { toStatus: "rejected", allowedActors: ["employer"] },
    { toStatus: "withdrawn", allowedActors: ["job_seeker"] },
  ],
  // Terminal states — no outbound transitions
  hired: [],
  rejected: [],
  withdrawn: [],
};

// ---------------------------------------------------------------------------
// Actor role mapping: session SCREAMING_SNAKE_CASE → db snake_case
// ---------------------------------------------------------------------------

/**
 * Maps an activePortalRole string (SCREAMING_SNAKE_CASE from JWT) to the
 * PortalActorRole used by the state machine and DB.
 * Routes MUST call this before invoking transition().
 */
export function toActorRole(activePortalRole: string): PortalActorRole {
  const map: Record<string, PortalActorRole> = {
    JOB_SEEKER: "job_seeker",
    EMPLOYER: "employer",
    JOB_ADMIN: "job_admin",
  };
  const role = map[activePortalRole];
  if (!role) {
    throw new ApiError({
      title: "Invalid portal role for application action",
      status: 403,
    });
  }
  return role;
}

// ---------------------------------------------------------------------------
// State machine transition
// ---------------------------------------------------------------------------

/**
 * Validates and executes an application status transition.
 *
 * - Fetches current application (404 if not found)
 * - Enforces terminal state guard (AC-8)
 * - Validates transition against VALID_TRANSITIONS (AC-4)
 * - Validates actor role is permitted (AC-4)
 * - Executes DB update + transition row insert in a single transaction (AC-3, AC-6)
 * - Emits event AFTER transaction commits (AC-5, AC-7)
 *
 * Does NOT handle the initial null → submitted assignment (P-2.5A's job).
 * Does NOT re-check job status post-creation (cascade policy from PREP-A).
 */
export async function transition(
  applicationId: string,
  toStatus: PortalApplicationStatus,
  actorUserId: string,
  actorRole: PortalActorRole,
  reason?: string,
): Promise<void> {
  // Fetch current application with companyId (needed for event payload)
  const application = await getApplicationWithCurrentStatus(applicationId);
  if (!application) {
    throw new ApiError({
      title: "Application not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const fromStatus = application.status;

  // Terminal state guard — no outbound transitions from hired/rejected/withdrawn
  if (isTerminalApplicationStatus(fromStatus)) {
    throw new ApiError({
      title: "Invalid status transition — application is in a terminal state",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Validate transition is permitted
  const allowedRules = VALID_TRANSITIONS[fromStatus] ?? [];
  const rule = allowedRules.find((r) => r.toStatus === toStatus);

  if (!rule) {
    throw new ApiError({
      title: `Invalid status transition: ${fromStatus} → ${toStatus}`,
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Validate actor role is permitted for this transition
  if (!rule.allowedActors.includes(actorRole)) {
    throw new ApiError({
      title: `Role '${actorRole}' is not permitted for transition ${fromStatus} → ${toStatus}`,
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Execute DB update + insert transition in a single transaction (AC-6)
  await db.transaction(async (tx) => {
    await tx
      .update(portalApplications)
      .set({
        status: toStatus,
        previousStatus: fromStatus,
        transitionedAt: new Date(),
        transitionedByUserId: actorUserId,
        transitionReason: reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(portalApplications.id, applicationId));

    await tx.insert(portalApplicationTransitions).values({
      applicationId,
      fromStatus,
      toStatus,
      actorUserId,
      actorRole,
      reason: reason ?? null,
    });
  });

  // Emit event AFTER transaction commits (AC-5, AC-7)
  if (toStatus === "withdrawn") {
    portalEventBus.emit("application.withdrawn", {
      applicationId,
      jobId: application.jobId,
      seekerUserId: application.seekerUserId,
      companyId: application.companyId,
      previousStatus: fromStatus,
      newStatus: "withdrawn",
      actorUserId,
    });
  } else {
    portalEventBus.emit("application.status_changed", {
      applicationId,
      jobId: application.jobId,
      seekerUserId: application.seekerUserId,
      companyId: application.companyId,
      previousStatus: fromStatus,
      newStatus: toStatus,
      actorUserId,
      actorRole,
    });
  }
}

// Re-export for P-2.5A and downstream consumers
export { getTransitionHistory };
