import "server-only";
import {
  insertVerificationRequest,
  getPendingVerificationForCompany,
  getVerificationById,
  getLatestVerificationForCompany,
  rejectVerification,
} from "@igbo/db/queries/portal-employer-verifications";
import type {
  PortalEmployerVerification,
  VerificationDocument,
} from "@igbo/db/queries/portal-employer-verifications";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { createNotification } from "@igbo/db/queries/notifications";
import { db } from "@igbo/db";
import { portalEmployerVerifications } from "@igbo/db/schema/portal-employer-verifications";
import { portalCompanyProfiles } from "@igbo/db/schema/portal-company-profiles";
import { auditLogs } from "@igbo/db/schema/audit-logs";
import { eq, and } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { portalEventBus } from "@/services/event-bus";

export type { PortalEmployerVerification };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

/**
 * Submit a verification request for a company.
 * Enforces deduplication: one pending request per company.
 */
export async function submitVerificationRequest(
  companyId: string,
  employerUserId: string,
  documents: VerificationDocument[],
): Promise<PortalEmployerVerification> {
  if (documents.length < 1 || documents.length > 3) {
    throw new ApiError({
      title: "Invalid document count",
      status: 400,
      detail: "1-3 documents are required",
    });
  }

  // Validate company exists
  const company = await getCompanyById(companyId);
  if (!company) {
    throw new ApiError({
      title: "Company not found",
      status: 409,
      extensions: { code: PORTAL_ERRORS.COMPANY_REQUIRED },
    });
  }

  // Verify employer owns the company
  if (company.ownerUserId !== employerUserId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  // Check no pending verification exists (layer 1 dedup)
  const existing = await getPendingVerificationForCompany(companyId);
  if (existing) {
    throw new ApiError({
      title: "Verification request already pending",
      status: 409,
      extensions: { code: PORTAL_ERRORS.VERIFICATION_ALREADY_PENDING },
    });
  }

  let verification: PortalEmployerVerification;
  try {
    verification = await insertVerificationRequest({ companyId, submittedDocuments: documents });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError({
        title: "Verification request already pending",
        status: 409,
        extensions: { code: PORTAL_ERRORS.VERIFICATION_ALREADY_PENDING },
      });
    }
    throw err;
  }

  // Audit log
  await db.insert(auditLogs).values({
    actorId: employerUserId,
    action: "portal.verification.submit",
    targetType: "portal_employer_verification",
    details: {
      verificationId: verification.id,
      companyId,
      documentCount: documents.length,
    },
  });

  // Emit event
  portalEventBus.emit("employer.verification_submitted", {
    companyId,
    employerUserId,
    verificationId: verification.id,
    documentCount: documents.length,
  });

  return verification;
}

/**
 * Admin approves a verification request.
 * Atomically sets verification to approved + sets trustBadge=true on company.
 */
export async function approveVerificationRequest(
  verificationId: string,
  adminUserId: string,
): Promise<void> {
  // Load verification to check status and get companyId + ownerUserId
  const verification = await getVerificationById(verificationId);
  if (!verification) {
    throw new ApiError({
      title: "Verification not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.VERIFICATION_NOT_FOUND },
    });
  }
  if (verification.status !== "pending") {
    throw new ApiError({
      title: "Verification is not pending",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Load company to get ownerUserId for notification
  const company = await getCompanyById(verification.companyId);
  if (!company) {
    throw new ApiError({
      title: "Company not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Transaction: approve verification + set trustBadge atomically
  await db.transaction(async (tx) => {
    const [approved] = await tx
      .update(portalEmployerVerifications)
      .set({ status: "approved", reviewedAt: new Date(), reviewedByAdminId: adminUserId })
      .where(
        and(
          eq(portalEmployerVerifications.id, verificationId),
          eq(portalEmployerVerifications.status, "pending"),
        ),
      )
      .returning({ id: portalEmployerVerifications.id });

    if (!approved) {
      // Race condition: another admin already approved/rejected
      throw new ApiError({
        title: "Verification is no longer pending",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      });
    }

    await tx
      .update(portalCompanyProfiles)
      .set({ trustBadge: true, updatedAt: new Date() })
      .where(eq(portalCompanyProfiles.id, verification.companyId));

    await tx.insert(auditLogs).values({
      actorId: adminUserId,
      action: "portal.verification.approve",
      targetType: "portal_employer_verification",
      details: {
        verificationId,
        companyId: verification.companyId,
      },
    });
  });

  // In-app notification to employer
  await createNotification({
    userId: company.ownerUserId,
    type: "system",
    title: "Your business has been verified!",
    body: "Your business has been verified! You now have a trust badge and fast-lane eligibility.",
    link: "/company-profile",
  });

  // Emit event
  portalEventBus.emit("employer.verification_approved", {
    companyId: verification.companyId,
    employerUserId: company.ownerUserId,
    verificationId,
    approvedByAdminId: adminUserId,
  });
}

/**
 * Admin rejects a verification request with a reason.
 */
export async function rejectVerificationRequest(
  verificationId: string,
  adminUserId: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length < 20) {
    throw new ApiError({
      title: "Rejection reason too short",
      status: 400,
      detail: "Rejection reason must be at least 20 characters",
    });
  }

  const verification = await getVerificationById(verificationId);
  if (!verification) {
    throw new ApiError({
      title: "Verification not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.VERIFICATION_NOT_FOUND },
    });
  }
  if (verification.status !== "pending") {
    throw new ApiError({
      title: "Verification is not pending",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  const company = await getCompanyById(verification.companyId);
  if (!company) {
    throw new ApiError({
      title: "Company not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Race-safe reject
  const rejected = await rejectVerification(verificationId, adminUserId, reason.trim());
  if (!rejected) {
    throw new ApiError({
      title: "Verification is no longer pending",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Audit log
  await db.insert(auditLogs).values({
    actorId: adminUserId,
    action: "portal.verification.reject",
    targetType: "portal_employer_verification",
    details: {
      verificationId,
      companyId: verification.companyId,
      reason: reason.trim(),
    },
  });

  // In-app notification to employer
  await createNotification({
    userId: company.ownerUserId,
    type: "system",
    title: "Verification update",
    body: `Your verification request was not approved. Reason: ${reason.trim()}`,
    link: "/company-profile",
  });

  // Emit event
  portalEventBus.emit("employer.verification_rejected", {
    companyId: verification.companyId,
    employerUserId: company.ownerUserId,
    verificationId,
    rejectedByAdminId: adminUserId,
    reason: reason.trim(),
  });
}

/**
 * Get the current verification status for a company.
 * Returns "verified" if trustBadge is set, otherwise checks latest verification record.
 */
export async function getVerificationStatus(companyId: string): Promise<{
  status: "verified" | "pending" | "rejected" | "unverified";
  latestVerification: PortalEmployerVerification | null;
}> {
  const company = await getCompanyById(companyId);
  if (!company) {
    return { status: "unverified", latestVerification: null };
  }

  if (company.trustBadge) {
    const latestVerification = await getLatestVerificationForCompany(companyId);
    return { status: "verified", latestVerification };
  }

  const latestVerification = await getLatestVerificationForCompany(companyId);
  if (!latestVerification) {
    return { status: "unverified", latestVerification: null };
  }

  if (latestVerification.status === "pending") {
    return { status: "pending", latestVerification };
  }

  if (latestVerification.status === "rejected") {
    return { status: "rejected", latestVerification };
  }

  return { status: "unverified", latestVerification: null };
}
