import "server-only";
import { db } from "../index";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalApplications } from "../schema/portal-applications";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { portalSeekerProfiles } from "../schema/portal-seeker-profiles";
import { portalAdminReviews } from "../schema/portal-admin-reviews";
import { getAdminActivitySummary } from "./portal-admin-reviews";
import { sql } from "drizzle-orm";

export interface PostingsAnalyticsRow {
  activeCount: number;
  pendingReviewCount: number;
  rejectedCount: number;
  expiredCount: number;
  prevRejectedCount: number;
  prevExpiredCount: number;
}

export interface ApplicationsAnalyticsRow {
  submittedCount: number;
  avgPerPosting: number;
  interviewConversionRate: number;
  prevSubmittedCount: number;
  prevAvgPerPosting: number;
  prevInterviewConversionRate: number;
}

export interface HiringAnalyticsRow {
  medianTimeToFillDays: number | null;
  hiresCount: number;
  offerAcceptRate: number;
  prevMedianTimeToFillDays: number | null;
  prevHiresCount: number;
  prevOfferAcceptRate: number;
}

export interface UsersAnalyticsRow {
  activeSeekers: number;
  activeEmployers: number;
  newRegistrations: number;
  prevActiveSeekers: number;
  prevActiveEmployers: number;
  prevNewRegistrations: number;
}

export interface ReviewPerformanceAnalyticsRow {
  avgReviewTimeMs: number | null;
  approvalRate: number;
  rejectionRate: number;
  changesRequestedRate: number;
  prevApprovalRate: number;
  prevRejectionRate: number;
  prevChangesRequestedRate: number;
}

/**
 * Returns posting counts using conditional aggregation (single query).
 * activeCount / pendingReviewCount are point-in-time snapshots.
 * rejected/expired counts use updatedAt within the period windows.
 */
export async function getPostingsAnalytics(periodDays: number = 30): Promise<PostingsAnalyticsRow> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_count,
      COUNT(CASE WHEN status = 'pending_review' THEN 1 END)::int AS pending_review_count,
      COUNT(CASE WHEN status = 'rejected'
        AND updated_at >= NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS rejected_count,
      COUNT(CASE WHEN status = 'expired'
        AND updated_at >= NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS expired_count,
      COUNT(CASE WHEN status = 'rejected'
        AND updated_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND updated_at < NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS prev_rejected_count,
      COUNT(CASE WHEN status = 'expired'
        AND updated_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND updated_at < NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS prev_expired_count
    FROM portal_job_postings
  `);

  const row = (rows as unknown[])[0] as Record<string, unknown>;
  return {
    activeCount: Number(row.active_count ?? 0),
    pendingReviewCount: Number(row.pending_review_count ?? 0),
    rejectedCount: Number(row.rejected_count ?? 0),
    expiredCount: Number(row.expired_count ?? 0),
    prevRejectedCount: Number(row.prev_rejected_count ?? 0),
    prevExpiredCount: Number(row.prev_expired_count ?? 0),
  };
}

/**
 * Returns application metrics using conditional aggregation (single query).
 * Guards against division by zero with NULLIF.
 */
export async function getApplicationsAnalytics(
  periodDays: number = 30,
): Promise<ApplicationsAnalyticsRow> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(CASE WHEN created_at >= NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS submitted_count,
      COUNT(DISTINCT CASE WHEN created_at >= NOW() - (${periodDays} || ' days')::interval THEN job_id END)::int AS distinct_jobs_current,
      COUNT(CASE WHEN status IN ('interview','shortlisted','offered','hired')
        AND created_at >= NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS interview_count,
      COUNT(CASE WHEN created_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND created_at < NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS prev_submitted_count,
      COUNT(DISTINCT CASE WHEN created_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND created_at < NOW() - (${periodDays} || ' days')::interval THEN job_id END)::int AS prev_distinct_jobs,
      COUNT(CASE WHEN status IN ('interview','shortlisted','offered','hired')
        AND created_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND created_at < NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS prev_interview_count
    FROM portal_applications
  `);

  const row = (rows as unknown[])[0] as Record<string, unknown>;
  const submittedCount = Number(row.submitted_count ?? 0);
  const distinctJobsCurrent = Number(row.distinct_jobs_current ?? 0);
  const interviewCount = Number(row.interview_count ?? 0);
  const prevSubmittedCount = Number(row.prev_submitted_count ?? 0);
  const prevDistinctJobs = Number(row.prev_distinct_jobs ?? 0);
  const prevInterviewCount = Number(row.prev_interview_count ?? 0);

  return {
    submittedCount,
    avgPerPosting:
      distinctJobsCurrent === 0 ? 0 : Math.round((submittedCount / distinctJobsCurrent) * 10) / 10,
    interviewConversionRate: submittedCount === 0 ? 0 : interviewCount / submittedCount,
    prevSubmittedCount,
    prevAvgPerPosting:
      prevDistinctJobs === 0 ? 0 : Math.round((prevSubmittedCount / prevDistinctJobs) * 10) / 10,
    prevInterviewConversionRate:
      prevSubmittedCount === 0 ? 0 : prevInterviewCount / prevSubmittedCount,
  };
}

/**
 * Returns hiring metrics. medianTimeToFillDays uses PERCENTILE_CONT.
 * Returns null for median if no hires exist in the period.
 */
export async function getHiringAnalytics(periodDays: number = 30): Promise<HiringAnalyticsRow> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(CASE WHEN a.status = 'hired'
        AND a.updated_at >= NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS hires_count,
      COUNT(CASE WHEN a.status IN ('offered','hired')
        AND a.updated_at >= NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS offered_or_hired_count,
      COUNT(CASE WHEN a.status = 'hired'
        AND a.updated_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND a.updated_at < NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS prev_hires_count,
      COUNT(CASE WHEN a.status IN ('offered','hired')
        AND a.updated_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND a.updated_at < NOW() - (${periodDays} || ' days')::interval THEN 1 END)::int AS prev_offered_or_hired_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (a.updated_at - jp.created_at)) / 86400.0
      ) FILTER (
        WHERE a.status = 'hired'
          AND a.updated_at >= NOW() - (${periodDays} || ' days')::interval
      ) AS median_ttf_days,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (a.updated_at - jp.created_at)) / 86400.0
      ) FILTER (
        WHERE a.status = 'hired'
          AND a.updated_at >= NOW() - (${periodDays * 2} || ' days')::interval
          AND a.updated_at < NOW() - (${periodDays} || ' days')::interval
      ) AS prev_median_ttf_days
    FROM portal_applications a
    JOIN portal_job_postings jp ON jp.id = a.job_id
  `);

  const row = (rows as unknown[])[0] as Record<string, unknown>;
  const hiresCount = Number(row.hires_count ?? 0);
  const offeredOrHiredCount = Number(row.offered_or_hired_count ?? 0);
  const prevHiresCount = Number(row.prev_hires_count ?? 0);
  const prevOfferedOrHiredCount = Number(row.prev_offered_or_hired_count ?? 0);

  return {
    medianTimeToFillDays:
      row.median_ttf_days != null ? Math.round(Number(row.median_ttf_days) * 10) / 10 : null,
    hiresCount,
    offerAcceptRate: offeredOrHiredCount === 0 ? 0 : hiresCount / offeredOrHiredCount,
    prevMedianTimeToFillDays:
      row.prev_median_ttf_days != null
        ? Math.round(Number(row.prev_median_ttf_days) * 10) / 10
        : null,
    prevHiresCount,
    prevOfferAcceptRate:
      prevOfferedOrHiredCount === 0 ? 0 : prevHiresCount / prevOfferedOrHiredCount,
  };
}

/**
 * Returns user activity metrics.
 * activeSeekers = distinct seekerUserIds with applications in the current period.
 * activeEmployers = distinct ownerUserIds with at least one non-draft posting ever.
 * newRegistrations = new seeker + company profiles in the period combined.
 */
export async function getUsersAnalytics(periodDays: number = 30): Promise<UsersAnalyticsRow> {
  const [seekerRows, employerRows, registrationRows] = await Promise.all([
    // Active seekers (distinct applicants in current + prev period)
    db.execute(sql`
      SELECT
        COUNT(DISTINCT CASE WHEN created_at >= NOW() - (${periodDays} || ' days')::interval
          THEN seeker_user_id END)::int AS active_seekers,
        COUNT(DISTINCT CASE WHEN created_at >= NOW() - (${periodDays * 2} || ' days')::interval
          AND created_at < NOW() - (${periodDays} || ' days')::interval
          THEN seeker_user_id END)::int AS prev_active_seekers
      FROM portal_applications
    `),
    // Active employers (distinct owners with any non-draft posting, ever)
    db.execute(sql`
      SELECT COUNT(DISTINCT pcp.owner_user_id)::int AS active_employers
      FROM portal_company_profiles pcp
      WHERE EXISTS (
        SELECT 1 FROM portal_job_postings pjp
        WHERE pjp.company_id = pcp.id AND pjp.status != 'draft'
      )
    `),
    // New registrations (seeker + company profiles created in periods)
    db.execute(sql`
      SELECT
        (
          SELECT COUNT(*)::int FROM portal_seeker_profiles
          WHERE created_at >= NOW() - (${periodDays} || ' days')::interval
        ) +
        (
          SELECT COUNT(*)::int FROM portal_company_profiles
          WHERE created_at >= NOW() - (${periodDays} || ' days')::interval
        ) AS new_registrations,
        (
          SELECT COUNT(*)::int FROM portal_seeker_profiles
          WHERE created_at >= NOW() - (${periodDays * 2} || ' days')::interval
            AND created_at < NOW() - (${periodDays} || ' days')::interval
        ) +
        (
          SELECT COUNT(*)::int FROM portal_company_profiles
          WHERE created_at >= NOW() - (${periodDays * 2} || ' days')::interval
            AND created_at < NOW() - (${periodDays} || ' days')::interval
        ) AS prev_new_registrations
    `),
  ]);

  const seekerRow = (seekerRows as unknown[])[0] as Record<string, unknown>;
  const employerRow = (employerRows as unknown[])[0] as Record<string, unknown>;
  const regRow = (registrationRows as unknown[])[0] as Record<string, unknown>;

  return {
    activeSeekers: Number(seekerRow.active_seekers ?? 0),
    activeEmployers: Number(employerRow.active_employers ?? 0),
    newRegistrations: Number(regRow.new_registrations ?? 0),
    prevActiveSeekers: Number(seekerRow.prev_active_seekers ?? 0),
    prevActiveEmployers: Number(employerRow.active_employers ?? 0), // no trend for point-in-time
    prevNewRegistrations: Number(regRow.prev_new_registrations ?? 0),
  };
}

/**
 * Returns review performance metrics.
 * Current period: reuses getAdminActivitySummary().
 * Previous period: computed separately for decision breakdown.
 */
export async function getReviewPerformanceAnalytics(
  periodDays: number = 30,
): Promise<ReviewPerformanceAnalyticsRow> {
  const [summary, prevRows] = await Promise.all([
    getAdminActivitySummary(),
    db.execute(sql`
      SELECT
        COUNT(CASE WHEN decision = 'approved' THEN 1 END)::int AS approved_count,
        COUNT(CASE WHEN decision = 'rejected' THEN 1 END)::int AS rejected_count,
        COUNT(CASE WHEN decision = 'changes_requested' THEN 1 END)::int AS changes_requested_count,
        COUNT(*)::int AS total_count
      FROM portal_admin_reviews
      WHERE reviewed_at >= NOW() - (${periodDays * 2} || ' days')::interval
        AND reviewed_at < NOW() - (${periodDays} || ' days')::interval
    `),
  ]);

  const prevRow = (prevRows as unknown[])[0] as Record<string, unknown>;
  const prevTotal = Number(prevRow.total_count ?? 0);
  const prevApproved = Number(prevRow.approved_count ?? 0);
  const prevRejected = Number(prevRow.rejected_count ?? 0);
  const prevChangesRequested = Number(prevRow.changes_requested_count ?? 0);

  return {
    avgReviewTimeMs: summary.avgReviewTimeMs,
    approvalRate: summary.approvalRate,
    rejectionRate: summary.rejectionRate,
    changesRequestedRate: summary.changesRequestedRate,
    prevApprovalRate: prevTotal === 0 ? 0 : prevApproved / prevTotal,
    prevRejectionRate: prevTotal === 0 ? 0 : prevRejected / prevTotal,
    prevChangesRequestedRate: prevTotal === 0 ? 0 : prevChangesRequested / prevTotal,
  };
}
