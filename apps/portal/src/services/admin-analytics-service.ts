import "server-only";
import {
  getPostingsAnalytics,
  getApplicationsAnalytics,
  getHiringAnalytics,
  getUsersAnalytics,
  getReviewPerformanceAnalytics,
} from "@igbo/db/queries/portal-admin-analytics";

export interface TrendData {
  direction: "up" | "down" | "stable";
  percentChange: number; // absolute value, rounded to 1 decimal
}

export interface MetricWithTrend<T = number> {
  value: T;
  trend: TrendData | null; // null = no previous data
}

export interface PostingsMetrics {
  activeCount: MetricWithTrend;
  pendingReviewCount: MetricWithTrend;
  rejectedCount: MetricWithTrend;
  expiredCount: MetricWithTrend;
}

export interface ApplicationsMetrics {
  submittedCount: MetricWithTrend;
  avgPerPosting: MetricWithTrend;
  interviewConversionRate: MetricWithTrend;
}

export interface HiringMetrics {
  medianTimeToFillDays: MetricWithTrend<number | null>;
  hiresCount: MetricWithTrend;
  offerAcceptRate: MetricWithTrend;
}

export interface UsersMetrics {
  activeSeekers: MetricWithTrend;
  activeEmployers: MetricWithTrend;
  newRegistrations: MetricWithTrend;
}

export interface ReviewMetrics {
  avgReviewTimeMs: number | null;
  approvalRate: MetricWithTrend;
  rejectionRate: MetricWithTrend;
  changesRequestedRate: MetricWithTrend;
}

export interface PlatformAnalytics {
  postings: PostingsMetrics;
  applications: ApplicationsMetrics;
  hiring: HiringMetrics;
  users: UsersMetrics;
  review: ReviewMetrics;
  generatedAt: string; // ISO timestamp
}

/**
 * Computes trend direction and percent change between current and previous values.
 * Returns null if previous is null/undefined (no comparison data available).
 * Uses ±1% as the stable threshold.
 */
export function computeTrend(
  current: number,
  previous: number | null | undefined,
): TrendData | null {
  if (previous == null) return null;

  if (previous === 0 && current === 0) {
    return { direction: "stable", percentChange: 0 };
  }

  if (previous === 0 && current > 0) {
    return { direction: "up", percentChange: 100 };
  }

  if (previous === 0 && current < 0) {
    return { direction: "down", percentChange: 100 };
  }

  const rawChange = ((current - previous) / Math.abs(previous)) * 100;
  const percentChange = Math.round(Math.abs(rawChange) * 10) / 10;
  const direction = Math.abs(rawChange) <= 1 ? "stable" : rawChange > 0 ? "up" : "down";

  return { direction, percentChange };
}

function withTrend(value: number, previous: number | null | undefined): MetricWithTrend {
  return { value, trend: computeTrend(value, previous) };
}

function withTrendNullable(
  value: number | null,
  previous: number | null | undefined,
): MetricWithTrend<number | null> {
  if (value == null) return { value: null, trend: null };
  if (previous == null) return { value, trend: null };
  return { value, trend: computeTrend(value, previous) };
}

/**
 * Aggregates all platform analytics by executing all 5 query groups in parallel.
 */
export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const [postingsRaw, applicationsRaw, hiringRaw, usersRaw, reviewRaw] = await Promise.all([
    getPostingsAnalytics(),
    getApplicationsAnalytics(),
    getHiringAnalytics(),
    getUsersAnalytics(),
    getReviewPerformanceAnalytics(),
  ]);

  return {
    postings: {
      // Point-in-time snapshots — no trend for active/pending
      activeCount: { value: postingsRaw.activeCount, trend: null },
      pendingReviewCount: { value: postingsRaw.pendingReviewCount, trend: null },
      rejectedCount: withTrend(postingsRaw.rejectedCount, postingsRaw.prevRejectedCount),
      expiredCount: withTrend(postingsRaw.expiredCount, postingsRaw.prevExpiredCount),
    },
    applications: {
      submittedCount: withTrend(applicationsRaw.submittedCount, applicationsRaw.prevSubmittedCount),
      avgPerPosting: withTrend(applicationsRaw.avgPerPosting, applicationsRaw.prevAvgPerPosting),
      interviewConversionRate: withTrend(
        applicationsRaw.interviewConversionRate,
        applicationsRaw.prevInterviewConversionRate,
      ),
    },
    hiring: {
      medianTimeToFillDays: withTrendNullable(
        hiringRaw.medianTimeToFillDays,
        hiringRaw.prevMedianTimeToFillDays,
      ),
      hiresCount: withTrend(hiringRaw.hiresCount, hiringRaw.prevHiresCount),
      offerAcceptRate: withTrend(hiringRaw.offerAcceptRate, hiringRaw.prevOfferAcceptRate),
    },
    users: {
      activeSeekers: withTrend(usersRaw.activeSeekers, usersRaw.prevActiveSeekers),
      activeEmployers: { value: usersRaw.activeEmployers, trend: null },
      newRegistrations: withTrend(usersRaw.newRegistrations, usersRaw.prevNewRegistrations),
    },
    review: {
      avgReviewTimeMs: reviewRaw.avgReviewTimeMs,
      approvalRate: withTrend(reviewRaw.approvalRate, reviewRaw.prevApprovalRate),
      rejectionRate: withTrend(reviewRaw.rejectionRate, reviewRaw.prevRejectionRate),
      changesRequestedRate: withTrend(
        reviewRaw.changesRequestedRate,
        reviewRaw.prevChangesRequestedRate,
      ),
    },
    generatedAt: new Date().toISOString(),
  };
}
