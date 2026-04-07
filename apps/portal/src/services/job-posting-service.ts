import "server-only";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  getJobPostingById,
  countActivePostingsByCompanyId,
  updateJobPostingStatus,
  updateJobPosting,
} from "@igbo/db/queries/portal-job-postings";
import { portalJobPostings } from "@igbo/db/schema/portal-job-postings";
import type { PortalJobStatus, PortalClosedOutcome } from "@igbo/db/schema/portal-job-postings";
import { db } from "@igbo/db";
import { and, eq } from "drizzle-orm";
import { assertApprovalIntegrity } from "@/lib/approval-integrity";
import { checkFastLaneEligibility } from "@/services/admin-review-service";

const VALID_TRANSITIONS: Record<PortalJobStatus, PortalJobStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["active", "rejected", "draft"], // ADMIN-ONLY — enforced below
  active: ["paused", "pending_review", "filled"],
  paused: ["active", "filled"],
  filled: [], // terminal
  expired: ["active", "pending_review", "filled"], // P-1.5: renew, edit+renew, close
  rejected: ["pending_review"],
};

// Transitions that MUST require JOB_ADMIN role — Approval Integrity Rule
const ADMIN_ONLY_TRANSITIONS = new Set([
  "pending_review:active",
  "pending_review:rejected",
  "pending_review:draft", // P-3.2: request changes — admin returns to draft
]);

// Active posting limit (configurable via platform settings; hardcoded for P-1.4)
const ACTIVE_POSTING_LIMIT = 5;

/**
 * Returns whether a posting in this status can be edited.
 * Returns false for pending_review and filled statuses.
 * Expired postings can be edited via the "Edit & Renew" path (Task 3.3 — P-1.5).
 */
export function canEditPosting(status: PortalJobStatus): boolean {
  return !["pending_review", "filled"].includes(status);
}

/**
 * Validates and executes a status transition for a posting.
 * Enforces ownership, role guards, transition validity, and active limit.
 */
export async function transitionStatus(
  postingId: string,
  targetStatus: PortalJobStatus,
  companyId: string,
  actorRole: string,
  options?: { expectedUpdatedAt?: string },
): Promise<void> {
  const posting = await getJobPostingById(postingId);

  if (!posting) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Ownership check
  if (posting.companyId !== companyId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  const transitionKey = `${posting.status}:${targetStatus}`;

  // Approval Integrity Rule: admin-only transitions
  if (ADMIN_ONLY_TRANSITIONS.has(transitionKey) && actorRole !== "JOB_ADMIN") {
    throw new ApiError({
      title: "Forbidden — admin approval required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  // Check transition is valid
  const allowedTargets = VALID_TRANSITIONS[posting.status] ?? [];
  if (!allowedTargets.includes(targetStatus)) {
    throw new ApiError({
      title: "Invalid status transition",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Active posting limit check (before transitioning to "active")
  if (targetStatus === "active") {
    const activeCount = await countActivePostingsByCompanyId(companyId);
    if (activeCount >= ACTIVE_POSTING_LIMIT) {
      throw new ApiError({
        title: "Active posting limit reached",
        status: 409,
        extensions: { code: PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED },
      });
    }
  }

  // Optimistic lock check
  if (options?.expectedUpdatedAt) {
    const expected = new Date(options.expectedUpdatedAt).getTime();
    const actual = new Date(posting.updatedAt).getTime();
    if (expected !== actual) {
      throw new ApiError({
        title: "Posting was modified by another request",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      });
    }
  }

  // AC-6 Approval Integrity Rule: any non-canonical path that flips a posting
  // from `pending_review` to `active` MUST have a backing approval row OR
  // satisfy fast-lane eligibility. The canonical `approvePosting()` route
  // inserts the row inside its own transaction; this guard catches every
  // other caller (e.g. direct status PATCH).
  if (posting.status === "pending_review" && targetStatus === "active") {
    await assertApprovalIntegrity(postingId);
  }

  await updateJobPostingStatus(postingId, targetStatus);
}

/**
 * Closes a posting with an outcome. Validates active or paused status.
 * Sets status to "filled", closedOutcome, and closedAt atomically.
 * Use this instead of transitionStatus("filled") to ensure closedOutcome/closedAt are recorded.
 */
export async function closePosting(
  postingId: string,
  outcome: PortalClosedOutcome,
  companyId: string,
): Promise<void> {
  const posting = await getJobPostingById(postingId);

  if (!posting) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (posting.companyId !== companyId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  if (!["active", "paused", "expired"].includes(posting.status)) {
    throw new ApiError({
      title: "Invalid status transition",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  await updateJobPosting(postingId, {
    status: "filled",
    closedOutcome: outcome,
    closedAt: new Date(),
  });
}

/**
 * Renews an expired posting with a new expiry date.
 * If contentChanged=false: transitions to active (subject to active limit).
 * If contentChanged=true: transitions to pending_review (edit was made on the edit page separately).
 * Clears archived_at if previously archived.
 */
export async function renewPosting(
  postingId: string,
  companyId: string,
  newExpiresAt: string,
  contentChanged: boolean,
  _actorRole: string,
): Promise<void> {
  const posting = await getJobPostingById(postingId);

  if (!posting) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (posting.companyId !== companyId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  if (posting.status !== "expired") {
    throw new ApiError({
      title: "Invalid status transition",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Validate new expiry date is in the future
  const newExpiry = new Date(newExpiresAt);
  if (isNaN(newExpiry.getTime()) || newExpiry <= new Date()) {
    throw new ApiError({
      title: "New expiry date must be in the future",
      status: 400,
    });
  }

  if (!contentChanged) {
    // Direct re-activation — check active posting limit
    const activeCount = await countActivePostingsByCompanyId(companyId);
    if (activeCount >= ACTIVE_POSTING_LIMIT) {
      throw new ApiError({
        title: "Active posting limit reached",
        status: 409,
        extensions: { code: PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED },
      });
    }
    await updateJobPosting(postingId, {
      status: "active",
      expiresAt: newExpiry,
      archivedAt: null,
    });
  } else {
    // Edit & Renew — requires re-review
    await updateJobPosting(postingId, {
      status: "pending_review",
      expiresAt: newExpiry,
      archivedAt: null,
    });
  }
}

/**
 * Submits a draft posting for review. Validates required fields.
 * Returns 422 if required fields are missing.
 */
export async function submitForReview(postingId: string, companyId: string): Promise<void> {
  const posting = await getJobPostingById(postingId);

  if (!posting) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (posting.companyId !== companyId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  if (posting.status !== "draft" && posting.status !== "rejected") {
    throw new ApiError({
      title: "Invalid status transition",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Validate required fields
  const fieldErrors: string[] = [];
  if (!posting.title?.trim()) fieldErrors.push("title");
  if (!posting.descriptionHtml?.trim()) fieldErrors.push("descriptionHtml");
  if (!posting.employmentType) fieldErrors.push("employmentType");
  if (!posting.location?.trim()) fieldErrors.push("location");

  if (fieldErrors.length > 0) {
    throw new ApiError({
      title: "Missing required fields",
      status: 422,
      detail: `Required fields missing: ${fieldErrors.join(", ")}`,
    });
  }

  // AC-7 Fast-Lane Auto-Approval — wired but currently always ineligible
  // (screening pipeline lands in P-3.3). When eligible, P-3.3 will replace
  // this 503 with a direct call to `approvePosting(postingId, SYSTEM_USER_ID)`.
  const fastLane = await checkFastLaneEligibility(postingId);
  if (fastLane.eligible) {
    throw new ApiError({
      title: "Fast-lane auto-approval is not yet enabled",
      status: 503,
      detail:
        "Fast-lane criteria met but the screening pipeline (P-3.3) has not shipped. Posting will be queued for manual review.",
    });
  }

  await updateJobPostingStatus(postingId, "pending_review");
}

/**
 * Edits an active posting atomically, transitioning it to pending_review.
 * Uses optimistic locking to prevent TOCTOU race conditions.
 * Only call this for active postings; use updateJobPosting for other editable statuses.
 */
export async function editActivePosting(
  postingId: string,
  companyId: string,
  data: Partial<
    Omit<
      Parameters<typeof updateJobPosting>[1],
      "status" | "closedOutcome" | "closedAt" | "adminFeedbackComment"
    >
  >,
  expectedUpdatedAt: string,
): Promise<void> {
  const posting = await getJobPostingById(postingId);

  if (!posting) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (posting.companyId !== companyId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  // Atomic optimistic lock: update only if updatedAt matches, always transitions to pending_review
  const [updated] = await db
    .update(portalJobPostings)
    .set({
      ...data,
      status: "pending_review",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(portalJobPostings.id, postingId),
        eq(portalJobPostings.updatedAt, new Date(expectedUpdatedAt)),
      ),
    )
    .returning();

  if (!updated) {
    throw new ApiError({
      title: "Posting was modified by another request — please reload",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }
}
