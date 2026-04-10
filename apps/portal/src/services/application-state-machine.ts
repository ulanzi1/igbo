import "server-only";
import { ApiError } from "@/lib/api-error";
import {
  getApplicationWithCurrentStatus,
  updateApplicationStatus,
  insertTransition,
} from "@igbo/db/queries/portal-applications";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

// ---------------------------------------------------------------------------
// Valid transitions: fromStatus → Set of allowed toStatuses
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<PortalApplicationStatus, PortalApplicationStatus[]> = {
  submitted: ["under_review", "rejected", "withdrawn"],
  under_review: ["shortlisted", "rejected", "withdrawn"],
  shortlisted: ["interview", "rejected", "withdrawn"],
  interview: ["offered", "rejected", "withdrawn"],
  offered: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

// ---------------------------------------------------------------------------
// transition — validate + persist + emit
// ---------------------------------------------------------------------------

export async function transition(
  applicationId: string,
  toStatus: string,
  actorUserId: string,
  actorRole: string,
): Promise<void> {
  const application = await getApplicationWithCurrentStatus(applicationId);

  if (!application) {
    throw new ApiError({ title: "Application not found", status: 404 });
  }

  const fromStatus = application.status as PortalApplicationStatus;
  const allowed = VALID_TRANSITIONS[fromStatus] ?? [];

  if (!allowed.includes(toStatus as PortalApplicationStatus)) {
    throw new ApiError({
      title: `Invalid status transition: ${fromStatus} → ${toStatus}`,
      status: 409,
    });
  }

  await updateApplicationStatus(applicationId, toStatus as PortalApplicationStatus);

  await insertTransition({
    applicationId,
    fromStatus,
    toStatus: toStatus as PortalApplicationStatus,
    actorUserId,
    actorRole: actorRole as "employer" | "job_seeker" | "job_admin",
    reason: null,
  });
}
