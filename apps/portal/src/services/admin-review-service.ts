import "server-only";
import {
  listPendingReviewPostings,
  getPostingWithReviewContext,
  getAdminActivitySummary,
  type QueueFilterOptions,
  type PendingReviewItem,
  type PostingReviewContext,
} from "@igbo/db/queries/portal-admin-reviews";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import type { PortalJobPosting } from "@igbo/db/schema/portal-job-postings";
import type { PortalCompanyProfile } from "@igbo/db/schema/portal-company-profiles";

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
  const context: PostingReviewContext | null = await getPostingWithReviewContext(postingId);

  if (!context) return null;

  const confidenceIndicator = await buildConfidenceIndicator(
    context.company.ownerUserId,
    context.company.trustBadge,
  );

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
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // pendingCount is already returned by getAdminActivitySummary; no extra round trip needed.
  return getAdminActivitySummary();
}
