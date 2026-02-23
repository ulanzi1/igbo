import "server-only";
import { requireAdminSession } from "@/lib/admin-auth";
import { logAdminAction } from "@/services/audit-logger";
import { enqueueEmailJob } from "@/services/email-service";
import { eventBus } from "@/services/event-bus";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  listApplications,
  getApplicationById,
  updateApplicationStatus,
  type ListApplicationsOptions,
  type ApplicationStatus,
} from "@/db/queries/admin-approvals";
import { ApiError } from "@/lib/api-error";

const VALID_TRANSITIONS: ApplicationStatus[] = ["APPROVED", "INFO_REQUESTED", "REJECTED"];

/**
 * Lists pending applications with pagination.
 */
export async function getApplicationsList(request: Request, options: ListApplicationsOptions = {}) {
  await requireAdminSession(request);
  return listApplications(options);
}

/**
 * Approves a membership application.
 */
export async function approveApplication(request: Request, targetUserId: string): Promise<void> {
  const { adminId } = await requireAdminSession(request);

  const application = await getApplicationById(targetUserId);
  if (!application) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Application not found" });
  }
  if (application.accountStatus !== "PENDING_APPROVAL") {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Invalid status transition",
    });
  }

  const updated = await updateApplicationStatus(targetUserId, "APPROVED");
  if (!updated) {
    throw new ApiError({ title: "Internal Server Error", status: 500 });
  }

  eventBus.emit("member.approved", {
    userId: targetUserId,
    approvedBy: adminId,
    timestamp: new Date().toISOString(),
  });

  enqueueEmailJob(`email-welcome-approved-${targetUserId}`, {
    to: updated.email,
    subject: "Welcome to OBIGBO — Your membership has been approved",
    templateId: "welcome-approved",
    data: { name: updated.name ?? updated.email },
  });

  const ipAddress =
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? undefined;
  await logAdminAction({
    actorId: adminId,
    action: "APPROVE_APPLICATION",
    targetUserId,
    details: { targetUserId },
    ipAddress: ipAddress ?? undefined,
  });
}

/**
 * Requests more information from an applicant.
 */
export async function requestMoreInfo(
  request: Request,
  targetUserId: string,
  rawMessage: string,
): Promise<void> {
  const { adminId } = await requireAdminSession(request);

  const application = await getApplicationById(targetUserId);
  if (!application) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Application not found" });
  }
  if (application.accountStatus !== "PENDING_APPROVAL") {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Invalid status transition",
    });
  }

  const safeMessage = sanitizeHtml(rawMessage);

  const updated = await updateApplicationStatus(targetUserId, "INFO_REQUESTED", safeMessage);
  if (!updated) {
    throw new ApiError({ title: "Internal Server Error", status: 500 });
  }

  eventBus.emit("member.info_requested", {
    userId: targetUserId,
    requestedBy: adminId,
    timestamp: new Date().toISOString(),
  });

  enqueueEmailJob(`email-request-info-${targetUserId}-${Date.now()}`, {
    to: updated.email,
    subject: "We have a question about your OBIGBO application",
    templateId: "request-info",
    data: { name: updated.name ?? updated.email, message: safeMessage },
  });

  const ipAddress =
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? undefined;
  await logAdminAction({
    actorId: adminId,
    action: "REQUEST_INFO",
    targetUserId,
    details: { targetUserId },
    ipAddress: ipAddress ?? undefined,
  });
}

/**
 * Rejects a membership application.
 */
export async function rejectApplication(
  request: Request,
  targetUserId: string,
  reason?: string,
): Promise<void> {
  const { adminId } = await requireAdminSession(request);

  const application = await getApplicationById(targetUserId);
  if (!application) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Application not found" });
  }
  if (application.accountStatus !== "PENDING_APPROVAL") {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Invalid status transition",
    });
  }

  const updated = await updateApplicationStatus(targetUserId, "REJECTED");
  if (!updated) {
    throw new ApiError({ title: "Internal Server Error", status: 500 });
  }

  eventBus.emit("member.rejected", {
    userId: targetUserId,
    rejectedBy: adminId,
    reason,
    timestamp: new Date().toISOString(),
  });

  enqueueEmailJob(`email-rejection-${targetUserId}`, {
    to: updated.email,
    subject: "Update on your OBIGBO membership application",
    templateId: "rejection-notice",
    data: { name: updated.name ?? updated.email },
  });

  const ipAddress =
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? undefined;
  await logAdminAction({
    actorId: adminId,
    action: "REJECT_APPLICATION",
    targetUserId,
    details: { targetUserId },
    ipAddress: ipAddress ?? undefined,
  });
}

/**
 * Undoes the last admin action on an application.
 * Only reverses if the current status matches undoFromStatus.
 */
export async function undoAction(
  request: Request,
  targetUserId: string,
  undoFromStatus: string,
): Promise<void> {
  const { adminId } = await requireAdminSession(request);

  if (!VALID_TRANSITIONS.includes(undoFromStatus as ApplicationStatus)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid undoFromStatus",
    });
  }

  const application = await getApplicationById(targetUserId);
  if (!application) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Application not found" });
  }
  if (application.accountStatus !== (undoFromStatus as ApplicationStatus)) {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Status has changed since the action was taken — undo is no longer possible",
    });
  }

  await updateApplicationStatus(targetUserId, "PENDING_APPROVAL", undefined);

  const ipAddress =
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? undefined;
  await logAdminAction({
    actorId: adminId,
    action: "UNDO_ACTION",
    targetUserId,
    details: { targetUserId, undoneStatus: undoFromStatus },
    ipAddress: ipAddress ?? undefined,
  });
}

export { VALID_TRANSITIONS };
