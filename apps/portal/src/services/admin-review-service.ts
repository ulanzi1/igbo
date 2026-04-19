import "server-only";
import {
  listPendingReviewPostings,
  getPostingWithReviewContext,
  getAdminActivitySummary,
  getReviewHistoryForPosting,
  type QueueFilterOptions,
  type PendingReviewItem,
} from "@igbo/db/queries/portal-admin-reviews";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import {
  getOpenFlagForPosting,
  getAdminFlagById,
  getFlagsForPosting,
  listOpenFlags,
  countOpenViolationsForCompany,
  countRecentViolationsForCompany,
  type OpenFlagWithContext,
} from "@igbo/db/queries/portal-admin-flags";
import {
  countActiveReportsForCompanyPostings,
  countActiveReportsForPosting,
} from "@igbo/db/queries/portal-posting-reports";
import { portalCompanyProfiles } from "@igbo/db/schema/portal-company-profiles";
import { portalJobPostings } from "@igbo/db/schema/portal-job-postings";
import { portalAdminReviews as adminReviewsTable } from "@igbo/db/schema/portal-admin-reviews";
import { portalAdminFlags } from "@igbo/db/schema/portal-admin-flags";
import { auditLogs } from "@igbo/db/schema/audit-logs";
import { db } from "@igbo/db";
import { eq, and, gte, count, sql, inArray } from "drizzle-orm";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import type { PortalJobPosting, ScreeningResult } from "@igbo/db/schema/portal-job-postings";
import type { PortalCompanyProfile } from "@igbo/db/schema/portal-company-profiles";
import type { PortalAdminFlag } from "@igbo/db/schema/portal-admin-flags";
import { ApiError } from "@/lib/api-error";
import {
  PORTAL_ERRORS,
  REJECTION_CATEGORIES,
  MAX_REVISION_COUNT,
  type RejectionCategory,
  type ViolationCategory,
} from "@/lib/portal-errors";
import { portalEventBus } from "@/services/event-bus";
import { invalidateAll } from "@/lib/cache-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ScreeningResult } from "@igbo/db/schema/portal-job-postings";

export interface ConfidenceIndicatorData {
  level: "high" | "medium" | "low";
  verifiedEmployer: boolean;
  violationCount: number;
  reportCount: number;
  engagementLevel: "low" | "medium" | "high";
}

export interface ReviewQueueItem {
  posting: PortalJobPosting & { employerTotalPostings: number };
  company: PortalCompanyProfile;
  employerName: string | null;
  confidenceIndicator: ConfidenceIndicatorData;
  isFirstTimeEmployer: boolean;
  screeningResult: ScreeningResult | null;
}

export interface ReviewQueueResult {
  items: ReviewQueueItem[];
  total: number;
}

export interface ReviewHistoryItem {
  id: string;
  decision: string;
  feedbackComment: string | null;
  reviewedAt: Date;
}

export interface ReviewDetailResult {
  posting: PortalJobPosting;
  company: PortalCompanyProfile;
  employerName: string | null;
  totalPostings: number;
  approvedCount: number;
  rejectedCount: number;
  confidenceIndicator: ConfidenceIndicatorData;
  screeningResult: ScreeningResult | null;
  reportCount: number;
  reviewHistory: ReviewHistoryItem[];
  flags: PortalAdminFlag[];
}

export interface DashboardSummary {
  pendingCount: number;
  reviewsToday: number;
  avgReviewTimeMs: number | null;
  approvalRate: number;
  rejectionRate: number;
  changesRequestedRate: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfidenceLevel(
  verifiedEmployer: boolean,
  violationCount: number,
  reportCount: number,
): "high" | "medium" | "low" {
  if (violationCount > 0 || reportCount >= 3) return "low";
  if (verifiedEmployer && violationCount === 0 && reportCount === 0) return "high";
  return "medium";
}

async function buildConfidenceIndicator(
  ownerUserId: string,
  trustBadge: boolean,
  companyId: string,
): Promise<ConfidenceIndicatorData> {
  const reportCount = await countActiveReportsForCompanyPostings(companyId);
  const violationCount = await countOpenViolationsForCompany(companyId);

  const signals = await getCommunityTrustSignals(ownerUserId).catch(() => null);
  const fallback = {
    isVerified: false,
    memberSince: null as Date | null,
    displayName: null as string | null,
    engagementLevel: "low" as const,
  };
  const trustSignals = signals ?? fallback;

  // Use company trustBadge for verification status (most reliable for P-3.1)
  const verifiedEmployer = trustBadge || trustSignals.isVerified;
  const engagementLevel = trustSignals.engagementLevel;

  return {
    level: getConfidenceLevel(verifiedEmployer, violationCount, reportCount),
    verifiedEmployer,
    violationCount,
    reportCount,
    engagementLevel,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function getReviewQueue(options: QueueFilterOptions): Promise<ReviewQueueResult> {
  const { items: rawItems, total } = await listPendingReviewPostings(options);

  const enrichedItems: ReviewQueueItem[] = await Promise.all(
    rawItems.map(async (item: PendingReviewItem) => {
      const confidenceIndicator = await buildConfidenceIndicator(
        item.company.ownerUserId,
        item.company.trustBadge,
        item.company.id,
      );

      const isFirstTimeEmployer = item.posting.employerTotalPostings === 1;

      return {
        posting: item.posting,
        company: item.company,
        employerName: item.employerName,
        confidenceIndicator,
        isFirstTimeEmployer,
        screeningResult: (item.posting.screeningResultJson as ScreeningResult | null) ?? null,
      };
    }),
  );

  // Priority sort: first-time employers first, then oldest submission
  // Tiers 1 (reported) and 4 (fast-lane) activate when P-3.4A/P-3.4B/P-3.2 add data
  enrichedItems.sort(
    (a, b) =>
      Number(b.isFirstTimeEmployer) - Number(a.isFirstTimeEmployer) ||
      a.posting.createdAt.getTime() - b.posting.createdAt.getTime(),
  );

  return { items: enrichedItems, total };
}

export async function getReviewDetail(postingId: string): Promise<ReviewDetailResult | null> {
  const [context, rawHistory, flags] = await Promise.all([
    getPostingWithReviewContext(postingId),
    getReviewHistoryForPosting(postingId),
    getFlagsForPosting(postingId),
  ]);

  if (!context) return null;

  const confidenceIndicator = await buildConfidenceIndicator(
    context.company.ownerUserId,
    context.company.trustBadge,
    context.company.id,
  );

  const reviewHistory: ReviewHistoryItem[] = rawHistory.map((r) => ({
    id: r.id,
    decision: r.decision,
    feedbackComment: r.feedbackComment ?? null,
    reviewedAt: r.reviewedAt,
  }));

  return {
    posting: context.posting,
    company: context.company,
    employerName: context.employerName,
    totalPostings: context.totalPostings,
    approvedCount: context.approvedCount,
    rejectedCount: context.rejectedCount,
    confidenceIndicator,
    screeningResult: (context.posting.screeningResultJson as ScreeningResult | null) ?? null,
    reportCount: await countActiveReportsForPosting(postingId),
    reviewHistory,
    flags,
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // pendingCount is already returned by getAdminActivitySummary; no extra round trip needed.
  return getAdminActivitySummary();
}

// ---------------------------------------------------------------------------
// P-3.2: Decision functions — approve / reject / request changes
// ---------------------------------------------------------------------------

/** Approve a pending posting — transitions to active, logs review, emits event. */
export async function approvePosting(
  postingId: string,
  reviewerUserId: string,
  metadata?: { fastLane?: boolean },
): Promise<void> {
  const posting = await getJobPostingById(postingId);
  if (!posting) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }
  if (posting.status !== "pending_review") {
    throw new ApiError({
      title: "Invalid status transition",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  await db.transaction(async (tx) => {
    // Race-safe: only flip status if it is *still* pending_review at this
    // moment. If a concurrent admin already decided it, .returning() yields
    // an empty array and we abort the tx (rolling back the unused insert
    // would have happened — see ordering: update FIRST, insert SECOND).
    const updated = await tx
      .update(portalJobPostings)
      .set({ status: "active" })
      .where(
        and(eq(portalJobPostings.id, postingId), eq(portalJobPostings.status, "pending_review")),
      )
      .returning({ id: portalJobPostings.id });

    if (updated.length === 0) {
      throw new ApiError({
        title: "Posting status changed by another admin",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      });
    }

    await tx.insert(adminReviewsTable).values({
      postingId,
      reviewerUserId,
      decision: "approved",
      feedbackComment: null,
    });

    await tx.insert(auditLogs).values({
      actorId: reviewerUserId,
      action: "portal.posting.approve",
      targetType: "portal_job_posting",
      details: {
        postingId,
        companyId: posting.companyId,
        decision: "approved",
        ...(metadata?.fastLane ? { fastLane: true } : {}),
      },
    });
  });

  portalEventBus.emit("job.reviewed", {
    jobId: postingId,
    reviewerUserId,
    decision: "approved",
    companyId: posting.companyId,
    ...(metadata?.fastLane ? { fastLane: true } : {}),
  });

  // Invalidate job search cache — posting entered active state.
  // Fire-and-forget: cache will expire in 60s if invalidation fails.
  // See docs/decisions/search-cache-strategy.md §Decision 1.
  invalidateAll().catch((err: Error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.admin-review-service.approve.invalidation-error",
        postingId,
        error: err.message,
      }),
    );
  });
}

/** Reject a pending posting — transitions to rejected, records reason + category, emits event. */
export async function rejectPosting(
  postingId: string,
  reviewerUserId: string,
  reason: string,
  category: RejectionCategory,
): Promise<void> {
  const posting = await getJobPostingById(postingId);
  if (!posting) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }
  if (posting.status !== "pending_review") {
    throw new ApiError({
      title: "Invalid status transition",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }
  if (reason.length < 20) {
    throw new ApiError({ title: "Reason too short (min 20 chars)", status: 400 });
  }
  if (!REJECTION_CATEGORIES.includes(category)) {
    throw new ApiError({ title: "Invalid rejection category", status: 400 });
  }

  await db.transaction(async (tx) => {
    // Race-safe: status guard inside the UPDATE.
    const updated = await tx
      .update(portalJobPostings)
      .set({ status: "rejected", adminFeedbackComment: reason })
      .where(
        and(eq(portalJobPostings.id, postingId), eq(portalJobPostings.status, "pending_review")),
      )
      .returning({ id: portalJobPostings.id });

    if (updated.length === 0) {
      throw new ApiError({
        title: "Posting status changed by another admin",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      });
    }

    await tx.insert(adminReviewsTable).values({
      postingId,
      reviewerUserId,
      decision: "rejected",
      feedbackComment: reason,
    });

    await tx.insert(auditLogs).values({
      actorId: reviewerUserId,
      action: "portal.posting.reject",
      targetType: "portal_job_posting",
      details: {
        postingId,
        companyId: posting.companyId,
        decision: "rejected",
        reason,
        category,
      },
    });
  });

  portalEventBus.emit("job.reviewed", {
    jobId: postingId,
    reviewerUserId,
    decision: "rejected",
    companyId: posting.companyId,
  });
}

/** Request changes — returns posting to draft, increments revisionCount, emits event. */
export async function requestChanges(
  postingId: string,
  reviewerUserId: string,
  feedbackComment: string,
): Promise<void> {
  const posting = await getJobPostingById(postingId);
  if (!posting) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }
  if (posting.status !== "pending_review") {
    throw new ApiError({
      title: "Invalid status transition",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }
  if (feedbackComment.length < 20) {
    throw new ApiError({ title: "Feedback too short (min 20 chars)", status: 400 });
  }
  if (posting.revisionCount >= MAX_REVISION_COUNT) {
    throw new ApiError({
      title: "Maximum revision cycles reached",
      status: 409,
      extensions: { code: PORTAL_ERRORS.MAX_REVISIONS_REACHED },
    });
  }

  await db.transaction(async (tx) => {
    // Race-safe: only flip to draft if still pending_review.
    // Atomic increment + status + feedback in a single guarded UPDATE.
    const updated = await tx
      .update(portalJobPostings)
      .set({
        status: "draft",
        adminFeedbackComment: feedbackComment,
        revisionCount: sql`${portalJobPostings.revisionCount} + 1`,
      })
      .where(
        and(eq(portalJobPostings.id, postingId), eq(portalJobPostings.status, "pending_review")),
      )
      .returning({ id: portalJobPostings.id });

    if (updated.length === 0) {
      throw new ApiError({
        title: "Posting status changed by another admin",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      });
    }

    await tx.insert(adminReviewsTable).values({
      postingId,
      reviewerUserId,
      decision: "changes_requested",
      feedbackComment,
    });

    await tx.insert(auditLogs).values({
      actorId: reviewerUserId,
      action: "portal.posting.request_changes",
      targetType: "portal_job_posting",
      details: {
        postingId,
        companyId: posting.companyId,
        decision: "changes_requested",
        feedbackComment,
      },
    });
  });

  portalEventBus.emit("job.reviewed", {
    jobId: postingId,
    reviewerUserId,
    decision: "changes_requested",
    companyId: posting.companyId,
  });
}

export interface FastLaneEligibility {
  eligible: boolean;
  reasons: string[];
}

/**
 * Check fast-lane auto-approval eligibility.
 * All three conditions must be true:
 *  1. employer is verified (trustBadge=true)
 *  2. no rejections in last 60 days
 *  3. screening status is "pass" (set by runScreening() in submitForReview — P-3.3)
 */
export async function checkFastLaneEligibility(postingId: string): Promise<FastLaneEligibility> {
  const posting = await getJobPostingById(postingId);
  if (!posting) {
    return { eligible: false, reasons: ["Posting not found"] };
  }

  const reasons: string[] = [];

  // 1. Company trust badge
  const [company] = await db
    .select({ trustBadge: portalCompanyProfiles.trustBadge })
    .from(portalCompanyProfiles)
    .where(eq(portalCompanyProfiles.id, posting.companyId))
    .limit(1);

  if (!company?.trustBadge) {
    reasons.push("Employer is not verified (trustBadge=false)");
  }

  // 2. No violations (rejections) in last 60 days
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const recentRejections = await db
    .select({ cnt: count() })
    .from(adminReviewsTable)
    .leftJoin(portalJobPostings, eq(adminReviewsTable.postingId, portalJobPostings.id))
    .where(
      and(
        eq(portalJobPostings.companyId, posting.companyId),
        eq(adminReviewsTable.decision, "rejected"),
        gte(adminReviewsTable.reviewedAt, sixtyDaysAgo),
      ),
    );

  if ((recentRejections[0]?.cnt ?? 0) > 0) {
    reasons.push("Violations (rejections) found in last 60 days");
  }

  // 3. Screening status must be "pass" (fail and warning both disqualify)
  if (posting.screeningStatus !== "pass") {
    const status = posting.screeningStatus ?? "not screened";
    reasons.push(`Screening status is not pass (current: ${status})`);
  }

  // 4. No violations (non-dismissed) in last 60 days
  const recentViolations = await countRecentViolationsForCompany(posting.companyId, sixtyDaysAgo);
  if (recentViolations > 0) {
    reasons.push("Policy violations found in last 60 days");
  }

  return { eligible: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// P-3.4A: Flag service functions
// ---------------------------------------------------------------------------

export type { PortalAdminFlag, OpenFlagWithContext };

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Create a policy violation flag for an active job posting.
 * High-severity flags auto-pause the posting.
 */
export async function flagPosting(
  postingId: string,
  adminUserId: string,
  category: ViolationCategory,
  severity: "low" | "medium" | "high",
  description: string,
): Promise<PortalAdminFlag> {
  const posting = await getJobPostingById(postingId);
  if (!posting) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }
  if (posting.status !== "active") {
    throw new ApiError({
      title: "Only active postings can be flagged",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_FLAG_TARGET },
    });
  }
  if (description.trim().length < 20) {
    throw new ApiError({ title: "Description too short (min 20 chars)", status: 400 });
  }

  // Check for existing open flag
  const existingFlag = await getOpenFlagForPosting(postingId);
  if (existingFlag) {
    throw new ApiError({
      title: "Posting already has an open flag",
      status: 409,
      extensions: { code: PORTAL_ERRORS.ALREADY_FLAGGED },
    });
  }

  let createdFlag: PortalAdminFlag;

  try {
    createdFlag = await db.transaction(async (tx) => {
      // Insert flag with autoPaused=false initially
      const [inserted] = await tx
        .insert(portalAdminFlags)
        .values({
          postingId,
          adminUserId,
          category,
          severity,
          description: description.trim(),
          status: "open",
          autoPaused: false,
        })
        .returning();
      if (!inserted) throw new Error("flagPosting: no row returned");

      let finalFlag = inserted;

      if (severity === "high") {
        // Race-safe: only pause if posting is still active
        const paused = await tx
          .update(portalJobPostings)
          .set({ status: "paused" })
          .where(and(eq(portalJobPostings.id, postingId), eq(portalJobPostings.status, "active")))
          .returning({ id: portalJobPostings.id });

        if (paused.length > 0) {
          // Posting was active and is now paused — mark flag as having caused the pause
          const [flagWithPause] = await tx
            .update(portalAdminFlags)
            .set({ autoPaused: true })
            .where(eq(portalAdminFlags.id, inserted.id))
            .returning();
          if (flagWithPause) finalFlag = flagWithPause;
        }
      }

      // Write audit log inside transaction (same as P-3.3 pattern — M1)
      await tx.insert(auditLogs).values({
        actorId: adminUserId,
        action: "portal.flag.create",
        targetType: "portal_admin_flag",
        details: {
          flagId: finalFlag.id,
          postingId,
          category,
          severity,
          autoPaused: finalFlag.autoPaused,
        },
      });

      return finalFlag;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError({
        title: "Posting already has an open flag",
        status: 409,
        extensions: { code: PORTAL_ERRORS.ALREADY_FLAGGED },
      });
    }
    throw err;
  }

  portalEventBus.emit("job.flagged", {
    jobId: postingId,
    flagId: createdFlag.id,
    adminUserId,
    category,
    severity,
    companyId: posting.companyId,
    autoPaused: createdFlag.autoPaused,
  });

  return createdFlag;
}

/**
 * Resolve an open flag by requesting changes or rejecting the posting.
 */
export async function resolveFlagWithAction(
  flagId: string,
  adminUserId: string,
  action: "request_changes" | "reject",
  note: string,
): Promise<void> {
  const flag = await getAdminFlagById(flagId);
  if (!flag || flag.status !== "open") {
    throw new ApiError({
      title: "Flag not found or already resolved",
      status: 404,
      extensions: { code: PORTAL_ERRORS.FLAG_NOT_FOUND },
    });
  }
  if (note.trim().length < 20) {
    throw new ApiError({ title: "Resolution note too short (min 20 chars)", status: 400 });
  }

  const posting = await getJobPostingById(flag.postingId);
  if (!posting) {
    throw new ApiError({ title: "Associated posting not found", status: 404 });
  }

  if (action === "request_changes" && posting.revisionCount >= MAX_REVISION_COUNT) {
    throw new ApiError({
      title: "Maximum revision cycles reached",
      status: 409,
      extensions: { code: PORTAL_ERRORS.MAX_REVISIONS_REACHED },
    });
  }

  await db.transaction(async (tx) => {
    // Atomically resolve flag (WHERE status='open' guard prevents double-resolve)
    const [resolvedFlag] = await tx
      .update(portalAdminFlags)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        resolvedByUserId: adminUserId,
        resolutionAction: action,
        resolutionNote: note.trim(),
      })
      .where(and(eq(portalAdminFlags.id, flagId), eq(portalAdminFlags.status, "open")))
      .returning({ id: portalAdminFlags.id });

    if (!resolvedFlag) {
      throw new ApiError({
        title: "Flag was resolved by another admin",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      });
    }

    if (action === "request_changes") {
      // Race-safe: guard on posting status to prevent overwriting unexpected states
      const updated = await tx
        .update(portalJobPostings)
        .set({
          status: "draft",
          adminFeedbackComment: note.trim(),
          revisionCount: sql`${portalJobPostings.revisionCount} + 1`,
        })
        .where(
          and(
            eq(portalJobPostings.id, flag.postingId),
            inArray(portalJobPostings.status, ["active", "paused", "pending_review"]),
          ),
        )
        .returning({ id: portalJobPostings.id });

      if (updated.length === 0) {
        throw new ApiError({
          title: "Posting status has changed — cannot apply resolution",
          status: 409,
          extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
        });
      }
    } else {
      // reject — race-safe: guard on posting status
      const updated = await tx
        .update(portalJobPostings)
        .set({
          status: "rejected",
          adminFeedbackComment: note.trim(),
        })
        .where(
          and(
            eq(portalJobPostings.id, flag.postingId),
            inArray(portalJobPostings.status, ["active", "paused", "pending_review"]),
          ),
        )
        .returning({ id: portalJobPostings.id });

      if (updated.length === 0) {
        throw new ApiError({
          title: "Posting status has changed — cannot apply resolution",
          status: 409,
          extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
        });
      }
    }

    // Insert admin review entry to maintain audit trail
    await tx.insert(adminReviewsTable).values({
      postingId: flag.postingId,
      reviewerUserId: adminUserId,
      decision: action === "request_changes" ? "changes_requested" : "rejected",
      feedbackComment: note.trim(),
    });

    await tx.insert(auditLogs).values({
      actorId: adminUserId,
      action: "portal.flag.resolve",
      targetType: "portal_admin_flag",
      details: {
        flagId,
        postingId: flag.postingId,
        action,
        note: note.trim(),
      },
    });
  });
}

/**
 * Dismiss an open flag.
 * If the flag caused an auto-pause, restores the posting to active.
 */
export async function dismissFlag(
  flagId: string,
  adminUserId: string,
  note: string,
): Promise<void> {
  const flag = await getAdminFlagById(flagId);
  if (!flag || flag.status !== "open") {
    throw new ApiError({
      title: "Flag not found or already resolved",
      status: 404,
      extensions: { code: PORTAL_ERRORS.FLAG_NOT_FOUND },
    });
  }
  if (note.trim().length < 20) {
    throw new ApiError({ title: "Resolution note too short (min 20 chars)", status: 400 });
  }

  await db.transaction(async (tx) => {
    const [dismissedFlag] = await tx
      .update(portalAdminFlags)
      .set({
        status: "dismissed",
        resolvedAt: new Date(),
        resolvedByUserId: adminUserId,
        resolutionAction: "dismiss",
        resolutionNote: note.trim(),
      })
      .where(and(eq(portalAdminFlags.id, flagId), eq(portalAdminFlags.status, "open")))
      .returning();

    if (!dismissedFlag) {
      throw new ApiError({
        title: "Flag was resolved by another admin",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      });
    }

    // If this flag auto-paused the posting, restore to active
    if (dismissedFlag.autoPaused) {
      // Race-safe: only un-pause if posting is still paused
      await tx
        .update(portalJobPostings)
        .set({ status: "active" })
        .where(
          and(eq(portalJobPostings.id, flag.postingId), eq(portalJobPostings.status, "paused")),
        );
    }

    await tx.insert(auditLogs).values({
      actorId: adminUserId,
      action: "portal.flag.dismiss",
      targetType: "portal_admin_flag",
      details: {
        flagId,
        postingId: flag.postingId,
        autoPaused: dismissedFlag.autoPaused,
        note: note.trim(),
      },
    });
  });
}

/** List open flags for the violations queue. */
export async function getViolationsQueue(options: {
  limit?: number;
  offset?: number;
  companyId?: string;
}): Promise<{ items: OpenFlagWithContext[]; total: number }> {
  const { limit = 50, offset = 0, companyId } = options;
  return listOpenFlags({ limit, offset, companyId });
}
