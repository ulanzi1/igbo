import "server-only";
import {
  getSeekerProfileById,
  getSeekerProfileByUserId,
  incrementProfileViewCount,
} from "@igbo/db/queries/portal-seeker-profiles";
import { getApplicationCountsByStatusForSeeker } from "@igbo/db/queries/portal-applications";
import { createRedisKey } from "@igbo/config/redis";
import { getRedisClient } from "@/lib/redis";

export interface SeekerAnalyticsData {
  profileViews: number;
  totalApplications: number;
  statusCounts: {
    active: number;
    interviews: number;
    offers: number;
    rejected: number;
    withdrawn: number;
  };
}

/**
 * Tracks a seeker profile view with 24-hour Redis dedup.
 *
 * Returns:
 *   - `true`  — this is a new (unique) view and the DB counter was incremented.
 *   - `false` — the view was NOT counted: either it was deduplicated within the
 *               24h window, the viewer is the profile owner (self-view), or the
 *               profile does not exist.
 *
 * Defensive guarantees:
 *   - Self-view guard is enforced HERE (not only at the route layer), so any
 *     future server action or background job that calls this service cannot
 *     bypass it.
 *   - Redis failure degrades gracefully: we still attempt the DB increment.
 *   - DB failure rolls back the Redis dedup key so the next retry is not
 *     silently swallowed by the dedup window.
 */
export async function recordSeekerProfileView(
  seekerProfileId: string,
  viewerUserId: string,
): Promise<boolean> {
  // Service-layer self-view guard — also enforced at the route layer but
  // duplicated here so this service is safe for any future caller.
  const profile = await getSeekerProfileById(seekerProfileId);
  if (!profile) return false;
  if (profile.userId === viewerUserId) return false;

  const key = createRedisKey("portal", "profile-view-dedup", `${seekerProfileId}:${viewerUserId}`);

  let redisKeyWritten = false;
  try {
    const redis = getRedisClient();
    const result = await redis.set(key, "1", "EX", 86400, "NX");
    if (result !== "OK") {
      // Duplicate within 24h window
      return false;
    }
    redisKeyWritten = true;
  } catch {
    // Redis down — skip dedup, still increment DB count (fail-open)
    console.warn("Redis unavailable for profile view dedup; proceeding with DB increment");
  }

  try {
    await incrementProfileViewCount(seekerProfileId);
  } catch (err) {
    // DB increment failed — roll back the dedup key so the viewer can retry
    // within the next 24h instead of being silently blocked.
    if (redisKeyWritten) {
      try {
        const redis = getRedisClient();
        await redis.del(key);
      } catch {
        // Best-effort rollback; surface original error below.
      }
    }
    throw err;
  }

  return true;
}

/**
 * Returns aggregated analytics for a seeker's dashboard.
 * Returns null if no seeker profile exists.
 */
export async function getSeekerAnalytics(
  seekerUserId: string,
): Promise<SeekerAnalyticsData | null> {
  const profile = await getSeekerProfileByUserId(seekerUserId);
  if (!profile) return null;

  const statusRows = await getApplicationCountsByStatusForSeeker(seekerUserId);

  const countMap = new Map(statusRows.map((row) => [row.status, row.count]));

  const active =
    (countMap.get("submitted") ?? 0) +
    (countMap.get("under_review") ?? 0) +
    (countMap.get("shortlisted") ?? 0);
  const interviews = countMap.get("interview") ?? 0;
  const offers = (countMap.get("offered") ?? 0) + (countMap.get("hired") ?? 0);
  const rejected = countMap.get("rejected") ?? 0;
  const withdrawn = countMap.get("withdrawn") ?? 0;

  const totalApplications = active + interviews + offers;

  return {
    profileViews: profile.profileViewCount,
    totalApplications,
    statusCounts: {
      active,
      interviews,
      offers,
      rejected,
      withdrawn,
    },
  };
}
