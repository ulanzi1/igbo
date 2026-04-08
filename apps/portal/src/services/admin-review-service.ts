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
import { portalCompanyProfiles } from "@igbo/db/schema/portal-company-profiles";
import { portalJobPostings } from "@igbo/db/schema/portal-job-postings";
import { portalAdminReviews as adminReviewsTable } from "@igbo/db/schema/portal-admin-reviews";
import { db } from "@igbo/db";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import type { PortalJobPosting } from "@igbo/db/schema/portal-job-postings";
import type { PortalCompanyProfile } from "@igbo/db/schema/portal-company-profiles";
import { ApiError } from "@/lib/api-error";
import {
  PORTAL_ERRORS,
  REJECTION_CATEGORIES,
  MAX_REVISION_COUNT,
  type RejectionCategory,
} from "@/lib/portal-errors";
import { portalEventBus } from "@/services/event-bus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Placeholder for screening results — populated by P-3.3.
 * Defined now (instead of literal `null`) so consumers can type-narrow
 * non-breakingly when P-3.3 lands. Empty until then.
 */
export type ScreeningResult = {
  // Reserved for P-3.3: pass/warning/fail status, structured flags, etc.
  readonly _placeholder?: never;
};

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
): Promise<ConfidenceIndicatorData> {
  // Violation count and report count are 0 until P-3.4A/P-3.4B add tables
  const violationCount = 0;
  const reportCount = 0;

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
      );

      const isFirstTimeEmployer = item.posting.employerTotalPostings === 1;

      return {
        posting: item.posting,
        company: item.company,
        employerName: item.employerName,
        confidenceIndicator,
        isFirstTimeEmployer,
        screeningResult: null,
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
  const [context, rawHistory] = await Promise.all([
    getPostingWithReviewContext(postingId),
    getReviewHistoryForPosting(postingId),
  ]);

  if (!context) return null;

  const confidenceIndicator = await buildConfidenceIndicator(
    context.company.ownerUserId,
    context.company.trustBadge,
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
    screeningResult: null,
    reportCount: 0,
    reviewHistory,
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
export async function approvePosting(postingId: string, reviewerUserId: string): Promise<void> {
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
  });

  portalEventBus.emit("job.reviewed", {
    jobId: postingId,
    reviewerUserId,
    decision: "approved",
    companyId: posting.companyId,
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
 *  3. screening status is "pass" (always null until P-3.3 — so always ineligible currently)
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

  // 3. Screening status must be "pass" — always null until P-3.3
  // posting.screeningStatus doesn't exist yet; effectively always null
  reasons.push("Screening not yet implemented (P-3.3)");

  return { eligible: reasons.length === 0, reasons };
}
