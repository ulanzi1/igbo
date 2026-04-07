import "server-only";
import { db } from "../index";
import { portalAdminReviews } from "../schema/portal-admin-reviews";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { authUsers } from "../schema/auth-users";
import type { PortalJobPosting } from "../schema/portal-job-postings";
import type { PortalCompanyProfile } from "../schema/portal-company-profiles";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";

export interface PendingReviewItem {
  posting: PortalJobPosting & { employerTotalPostings: number };
  company: PortalCompanyProfile;
  employerName: string | null;
}

export interface PendingReviewListResult {
  items: PendingReviewItem[];
  total: number;
}

export interface QueueFilterOptions {
  page: number;
  pageSize: number;
  verifiedOnly?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  minRevisionCount?: number;
}

export async function listPendingReviewPostings(
  options: QueueFilterOptions,
): Promise<PendingReviewListResult> {
  const { page, pageSize, verifiedOnly, dateFrom, dateTo, minRevisionCount } = options;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(portalJobPostings.status, "pending_review")];

  if (verifiedOnly) {
    conditions.push(eq(portalCompanyProfiles.trustBadge, true));
  }
  if (dateFrom) {
    conditions.push(gte(portalJobPostings.createdAt, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(portalJobPostings.createdAt, dateTo));
  }
  if (minRevisionCount !== undefined && minRevisionCount > 0) {
    conditions.push(sql`${portalJobPostings.revisionCount} >= ${minRevisionCount}`);
  }

  const whereClause = and(...conditions);

  const employerTotalPostingsSql = sql<number>`(
    SELECT COUNT(*) FROM portal_job_postings
    WHERE company_id = ${portalJobPostings.companyId}
  )`.as("employer_total_postings");

  const rows = await db
    .select({
      // Posting fields
      postingId: portalJobPostings.id,
      companyId: portalJobPostings.companyId,
      title: portalJobPostings.title,
      descriptionHtml: portalJobPostings.descriptionHtml,
      requirements: portalJobPostings.requirements,
      salaryMin: portalJobPostings.salaryMin,
      salaryMax: portalJobPostings.salaryMax,
      salaryCompetitiveOnly: portalJobPostings.salaryCompetitiveOnly,
      location: portalJobPostings.location,
      employmentType: portalJobPostings.employmentType,
      status: portalJobPostings.status,
      culturalContextJson: portalJobPostings.culturalContextJson,
      descriptionIgboHtml: portalJobPostings.descriptionIgboHtml,
      applicationDeadline: portalJobPostings.applicationDeadline,
      expiresAt: portalJobPostings.expiresAt,
      adminFeedbackComment: portalJobPostings.adminFeedbackComment,
      closedOutcome: portalJobPostings.closedOutcome,
      closedAt: portalJobPostings.closedAt,
      archivedAt: portalJobPostings.archivedAt,
      revisionCount: portalJobPostings.revisionCount,
      viewCount: portalJobPostings.viewCount,
      communityPostId: portalJobPostings.communityPostId,
      postingCreatedAt: portalJobPostings.createdAt,
      postingUpdatedAt: portalJobPostings.updatedAt,
      // Company fields
      companyProfileId: portalCompanyProfiles.id,
      companyOwnerUserId: portalCompanyProfiles.ownerUserId,
      companyName: portalCompanyProfiles.name,
      companyLogoUrl: portalCompanyProfiles.logoUrl,
      companyDescription: portalCompanyProfiles.description,
      companyIndustry: portalCompanyProfiles.industry,
      companySize: portalCompanyProfiles.companySize,
      companyCultureInfo: portalCompanyProfiles.cultureInfo,
      companyTrustBadge: portalCompanyProfiles.trustBadge,
      companyOnboardingCompletedAt: portalCompanyProfiles.onboardingCompletedAt,
      companyCreatedAt: portalCompanyProfiles.createdAt,
      companyUpdatedAt: portalCompanyProfiles.updatedAt,
      // Employer name
      employerName: authUsers.name,
      // Employer total postings
      employerTotalPostings: employerTotalPostingsSql,
    })
    .from(portalJobPostings)
    .leftJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .leftJoin(authUsers, eq(portalCompanyProfiles.ownerUserId, authUsers.id))
    .where(whereClause)
    .orderBy(portalJobPostings.createdAt)
    .limit(pageSize)
    .offset(offset);

  // Count total matching rows
  const [countRow] = await db
    .select({ total: count() })
    .from(portalJobPostings)
    .leftJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .where(whereClause);

  const total = countRow?.total ?? 0;

  const items: PendingReviewItem[] = rows.map((row) => {
    const posting: PortalJobPosting & { employerTotalPostings: number } = {
      id: row.postingId,
      companyId: row.companyId,
      title: row.title,
      descriptionHtml: row.descriptionHtml,
      requirements: row.requirements,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryCompetitiveOnly: row.salaryCompetitiveOnly,
      location: row.location,
      employmentType: row.employmentType,
      status: row.status,
      culturalContextJson: row.culturalContextJson,
      descriptionIgboHtml: row.descriptionIgboHtml,
      applicationDeadline: row.applicationDeadline,
      expiresAt: row.expiresAt,
      adminFeedbackComment: row.adminFeedbackComment,
      closedOutcome: row.closedOutcome,
      closedAt: row.closedAt,
      archivedAt: row.archivedAt,
      revisionCount: row.revisionCount,
      viewCount: row.viewCount,
      communityPostId: row.communityPostId,
      createdAt: row.postingCreatedAt,
      updatedAt: row.postingUpdatedAt,
      employerTotalPostings: row.employerTotalPostings,
    };

    const company: PortalCompanyProfile = {
      id: row.companyProfileId ?? row.companyId,
      ownerUserId: row.companyOwnerUserId ?? "",
      name: row.companyName ?? "",
      logoUrl: row.companyLogoUrl ?? null,
      description: row.companyDescription ?? null,
      industry: row.companyIndustry ?? null,
      companySize: row.companySize ?? null,
      cultureInfo: row.companyCultureInfo ?? null,
      trustBadge: row.companyTrustBadge ?? false,
      onboardingCompletedAt: row.companyOnboardingCompletedAt ?? null,
      createdAt: row.companyCreatedAt ?? new Date(),
      updatedAt: row.companyUpdatedAt ?? new Date(),
    };

    return {
      posting,
      company,
      employerName: row.employerName ?? null,
    };
  });

  return { items, total };
}

export interface PostingReviewContext {
  posting: PortalJobPosting;
  company: PortalCompanyProfile;
  employerName: string | null;
  totalPostings: number;
  approvedCount: number;
  rejectedCount: number;
}

export async function getPostingWithReviewContext(
  postingId: string,
): Promise<PostingReviewContext | null> {
  const [row] = await db
    .select({
      // Posting fields
      postingId: portalJobPostings.id,
      companyId: portalJobPostings.companyId,
      title: portalJobPostings.title,
      descriptionHtml: portalJobPostings.descriptionHtml,
      requirements: portalJobPostings.requirements,
      salaryMin: portalJobPostings.salaryMin,
      salaryMax: portalJobPostings.salaryMax,
      salaryCompetitiveOnly: portalJobPostings.salaryCompetitiveOnly,
      location: portalJobPostings.location,
      employmentType: portalJobPostings.employmentType,
      status: portalJobPostings.status,
      culturalContextJson: portalJobPostings.culturalContextJson,
      descriptionIgboHtml: portalJobPostings.descriptionIgboHtml,
      applicationDeadline: portalJobPostings.applicationDeadline,
      expiresAt: portalJobPostings.expiresAt,
      adminFeedbackComment: portalJobPostings.adminFeedbackComment,
      closedOutcome: portalJobPostings.closedOutcome,
      closedAt: portalJobPostings.closedAt,
      archivedAt: portalJobPostings.archivedAt,
      revisionCount: portalJobPostings.revisionCount,
      viewCount: portalJobPostings.viewCount,
      communityPostId: portalJobPostings.communityPostId,
      postingCreatedAt: portalJobPostings.createdAt,
      postingUpdatedAt: portalJobPostings.updatedAt,
      // Company fields
      companyProfileId: portalCompanyProfiles.id,
      companyOwnerUserId: portalCompanyProfiles.ownerUserId,
      companyName: portalCompanyProfiles.name,
      companyLogoUrl: portalCompanyProfiles.logoUrl,
      companyDescription: portalCompanyProfiles.description,
      companyIndustry: portalCompanyProfiles.industry,
      companySize: portalCompanyProfiles.companySize,
      companyCultureInfo: portalCompanyProfiles.cultureInfo,
      companyTrustBadge: portalCompanyProfiles.trustBadge,
      companyOnboardingCompletedAt: portalCompanyProfiles.onboardingCompletedAt,
      companyCreatedAt: portalCompanyProfiles.createdAt,
      companyUpdatedAt: portalCompanyProfiles.updatedAt,
      // Employer name
      employerName: authUsers.name,
    })
    .from(portalJobPostings)
    .leftJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .leftJoin(authUsers, eq(portalCompanyProfiles.ownerUserId, authUsers.id))
    .where(eq(portalJobPostings.id, postingId))
    .limit(1);

  if (!row) return null;

  // Count total postings by this employer's company
  const [totalRow] = await db
    .select({ total: count() })
    .from(portalJobPostings)
    .where(eq(portalJobPostings.companyId, row.companyId));

  // Count approved and rejected reviews for this company's postings
  const [approvedRow] = await db
    .select({ cnt: count() })
    .from(portalAdminReviews)
    .leftJoin(portalJobPostings, eq(portalAdminReviews.postingId, portalJobPostings.id))
    .where(
      and(
        eq(portalJobPostings.companyId, row.companyId),
        eq(portalAdminReviews.decision, "approved"),
      ),
    );

  const [rejectedRow] = await db
    .select({ cnt: count() })
    .from(portalAdminReviews)
    .leftJoin(portalJobPostings, eq(portalAdminReviews.postingId, portalJobPostings.id))
    .where(
      and(
        eq(portalJobPostings.companyId, row.companyId),
        eq(portalAdminReviews.decision, "rejected"),
      ),
    );

  const posting: PortalJobPosting = {
    id: row.postingId,
    companyId: row.companyId,
    title: row.title,
    descriptionHtml: row.descriptionHtml,
    requirements: row.requirements,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCompetitiveOnly: row.salaryCompetitiveOnly,
    location: row.location,
    employmentType: row.employmentType,
    status: row.status,
    culturalContextJson: row.culturalContextJson,
    descriptionIgboHtml: row.descriptionIgboHtml,
    applicationDeadline: row.applicationDeadline,
    expiresAt: row.expiresAt,
    adminFeedbackComment: row.adminFeedbackComment,
    closedOutcome: row.closedOutcome,
    closedAt: row.closedAt,
    archivedAt: row.archivedAt,
    revisionCount: row.revisionCount,
    viewCount: row.viewCount,
    communityPostId: row.communityPostId,
    createdAt: row.postingCreatedAt,
    updatedAt: row.postingUpdatedAt,
  };

  const company: PortalCompanyProfile = {
    id: row.companyProfileId ?? row.companyId,
    ownerUserId: row.companyOwnerUserId ?? "",
    name: row.companyName ?? "",
    logoUrl: row.companyLogoUrl ?? null,
    description: row.companyDescription ?? null,
    industry: row.companyIndustry ?? null,
    companySize: row.companySize ?? null,
    cultureInfo: row.companyCultureInfo ?? null,
    trustBadge: row.companyTrustBadge ?? false,
    onboardingCompletedAt: row.companyOnboardingCompletedAt ?? null,
    createdAt: row.companyCreatedAt ?? new Date(),
    updatedAt: row.companyUpdatedAt ?? new Date(),
  };

  return {
    posting,
    company,
    employerName: row.employerName ?? null,
    totalPostings: totalRow?.total ?? 0,
    approvedCount: approvedRow?.cnt ?? 0,
    rejectedCount: rejectedRow?.cnt ?? 0,
  };
}

export interface AdminActivitySummary {
  pendingCount: number;
  reviewsToday: number;
  avgReviewTimeMs: number | null;
  approvalRate: number;
  rejectionRate: number;
  changesRequestedRate: number;
}

export async function getAdminActivitySummary(): Promise<AdminActivitySummary> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Run independent aggregates in parallel:
  //  1. pending postings count
  //  2. reviews-today count
  //  3. decision breakdown (single GROUP BY rather than 4 separate queries)
  //  4. avg review time
  const [pendingResult, todayResult, decisionRows, avgRow] = await Promise.all([
    db
      .select({ total: count() })
      .from(portalJobPostings)
      .where(eq(portalJobPostings.status, "pending_review")),
    db
      .select({ total: count() })
      .from(portalAdminReviews)
      .where(gte(portalAdminReviews.reviewedAt, today)),
    db
      .select({ decision: portalAdminReviews.decision, total: count() })
      .from(portalAdminReviews)
      .groupBy(portalAdminReviews.decision),
    db
      .select({
        avgMs: sql<string | null>`AVG(
          EXTRACT(EPOCH FROM (${portalAdminReviews.reviewedAt} - ${portalJobPostings.updatedAt})) * 1000
        )`,
      })
      .from(portalAdminReviews)
      .leftJoin(portalJobPostings, eq(portalAdminReviews.postingId, portalJobPostings.id))
      .then((rows) => rows[0]),
  ]);

  let approvedCount = 0;
  let rejectedCount = 0;
  let changesCount = 0;
  for (const row of decisionRows) {
    if (row.decision === "approved") approvedCount = row.total;
    else if (row.decision === "rejected") rejectedCount = row.total;
    else if (row.decision === "changes_requested") changesCount = row.total;
  }
  const totalReviews = approvedCount + rejectedCount + changesCount;

  const approvalRate = totalReviews > 0 ? approvedCount / totalReviews : 0;
  const rejectionRate = totalReviews > 0 ? rejectedCount / totalReviews : 0;
  const changesRequestedRate = totalReviews > 0 ? changesCount / totalReviews : 0;

  const avgReviewTimeMs =
    avgRow?.avgMs != null && avgRow.avgMs !== "null" ? parseFloat(avgRow.avgMs) : null;

  return {
    pendingCount: pendingResult[0]?.total ?? 0,
    reviewsToday: todayResult[0]?.total ?? 0,
    avgReviewTimeMs,
    approvalRate,
    rejectionRate,
    changesRequestedRate,
  };
}

export async function countPendingReviewPostings(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(portalJobPostings)
    .where(eq(portalJobPostings.status, "pending_review"));
  return row?.total ?? 0;
}
