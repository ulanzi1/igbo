import "server-only";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  getJobPostingWithCompany,
  incrementViewCount,
  getJobAnalytics,
  markSharedToCommunity,
} from "@igbo/db/queries/portal-job-postings";
import { insertPost } from "@igbo/db/queries/posts";
import { createRedisKey } from "@igbo/config/redis";
import { getRedisClient } from "@/lib/redis";
import { portalEventBus } from "@/services/event-bus";

export interface JobAnalyticsResult {
  views: number;
  applications: number;
  conversionRate: number;
  sharedToCommunity: boolean;
}

export interface ShareResult {
  success: boolean;
  communityPostId?: string;
  reason?: "already_shared";
}

/**
 * Tracks a job view with 24-hour deduplication via Redis SET NX EX.
 * Returns true if this is a new view (counted), false if deduplicated.
 */
export async function trackJobView(jobId: string, userId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = createRedisKey("portal", "job-view-dedup", `${jobId}:${userId}`);
    const result = await redis.set(key, "1", "EX", 86400, "NX");

    if (result === "OK") {
      // New view — increment DB counter
      await incrementViewCount(jobId);
      portalEventBus.emit("job.viewed", { jobId, userId, isNewView: true });
      return true;
    }

    // Duplicate within 24h window — do not count
    return false;
  } catch {
    // Redis errors are non-critical — gracefully degrade
    return false;
  }
}

/**
 * Returns analytics for a job posting, with ownership validation.
 */
export async function getAnalytics(jobId: string, companyId: string): Promise<JobAnalyticsResult> {
  const result = await getJobPostingWithCompany(jobId);

  if (!result) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (result.posting.companyId !== companyId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  const analytics = await getJobAnalytics(jobId);
  if (!analytics) {
    // Posting exists but analytics returned null — shouldn't happen; return zeros
    return { views: 0, applications: 0, conversionRate: 0, sharedToCommunity: false };
  }

  return {
    views: analytics.viewCount,
    applications: analytics.applicationCount,
    conversionRate: analytics.conversionRate,
    sharedToCommunity: analytics.communityPostId !== null,
  };
}

/**
 * Shares a job posting to the community feed.
 * Validates ownership and active status. Idempotent — returns already_shared if shared.
 */
export async function shareJobToCommunity(
  jobId: string,
  companyId: string,
  userId: string,
): Promise<ShareResult> {
  const result = await getJobPostingWithCompany(jobId);

  if (!result) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (result.posting.companyId !== companyId) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  if (result.posting.status !== "active") {
    throw new ApiError({
      title: "Only active postings can be shared",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  if (result.posting.communityPostId !== null) {
    return { success: false, reason: "already_shared" };
  }

  const { posting, company } = result;

  // Build community post content
  const portalBase = process.env.NEXTAUTH_URL ?? "http://localhost:3001"; // ci-allow-process-env
  const employmentTypeLabel = posting.employmentType.replace(/_/g, " ");
  const content = [
    `${company.name} is hiring!`,
    ``,
    `${posting.title}`,
    `📍 ${posting.location ?? "Remote"} · ${employmentTypeLabel}`,
    ``,
    `View and apply: ${portalBase}/en/jobs/${jobId}`,
  ].join("\n");

  const communityPost = await insertPost({
    authorId: userId,
    content,
    contentType: "text",
    visibility: "members_only",
    category: "announcement",
    status: "active",
  });

  const updated = await markSharedToCommunity(jobId, communityPost.id);
  if (!updated) {
    // Race condition — another request already shared it
    return { success: false, reason: "already_shared" };
  }

  portalEventBus.emit("job.shared_to_community", {
    jobId,
    companyId,
    communityPostId: communityPost.id,
    employerUserId: userId,
  });

  return { success: true, communityPostId: communityPost.id };
}
