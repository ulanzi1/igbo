import "server-only";
import { getRedisClient } from "@/lib/redis";
import { ApiError } from "@/lib/api-error";
import {
  getSavedSearchesByUserId,
  countSavedSearchesByUserId,
  insertSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  getSavedSearchById,
  getInstantAlertSearches,
} from "@igbo/db/queries/portal-saved-searches";
import { createRedisKey } from "@igbo/config/redis";
import { portalEventBus } from "@/services/event-bus";
import type { JobSearchRequest } from "@/lib/validations/job-search";
import type {
  PortalSavedSearch,
  PortalAlertFrequency,
} from "@igbo/db/queries/portal-saved-searches";

export type { PortalSavedSearch, PortalAlertFrequency };

const MAX_SAVED_SEARCHES = 10;
const INSTANT_ALERT_DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const INSTANT_ALERT_THROTTLE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const INSTANT_ALERT_MAX_PER_DAY = 5;

/**
 * Generates a human-readable name from search params.
 * Truncated to 100 chars.
 */
export function generateSearchName(searchParams: JobSearchRequest): string {
  const parts: string[] = [];
  if (searchParams.query) parts.push(searchParams.query);

  const f = searchParams.filters;
  if (f) {
    if (f.location && f.location.length > 0) parts.push(`in ${f.location.slice(0, 2).join(", ")}`);
    if (f.employmentType && f.employmentType.length > 0) parts.push(f.employmentType[0]!);
    if (f.industry && f.industry.length > 0) parts.push(f.industry[0]!);
    if (f.remote) parts.push("remote");
  }

  const name = parts.length > 0 ? `Search: ${parts.join(", ")}` : "Search: All Jobs";
  return name.slice(0, 100);
}

/**
 * Saves a new saved search. Enforces max 10 limit.
 * Auto-generates name if not provided.
 */
export async function saveSavedSearch(
  userId: string,
  params: {
    name?: string;
    searchParams: JobSearchRequest;
    alertFrequency: PortalAlertFrequency;
  },
): Promise<PortalSavedSearch> {
  const count = await countSavedSearchesByUserId(userId);
  if (count >= MAX_SAVED_SEARCHES) {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Maximum 10 saved searches reached",
    });
  }

  const name = params.name?.trim()
    ? params.name.trim().slice(0, 100)
    : generateSearchName(params.searchParams);

  return insertSavedSearch({
    userId,
    name,
    searchParamsJson: params.searchParams as Record<string, unknown>,
    alertFrequency: params.alertFrequency,
  });
}

/**
 * Returns all saved searches for the user.
 */
export async function getMySearches(userId: string): Promise<PortalSavedSearch[]> {
  return getSavedSearchesByUserId(userId);
}

/**
 * Updates a saved search. Verifies ownership.
 * Throws 404 if not found, 403 if owned by another user.
 */
export async function updateMySearch(
  userId: string,
  searchId: string,
  updates: { name?: string; alertFrequency?: PortalAlertFrequency },
): Promise<PortalSavedSearch> {
  const existing = await getSavedSearchById(searchId);
  if (!existing) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }
  if (existing.userId !== userId) {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }

  const data: Parameters<typeof updateSavedSearch>[1] = {};
  if (updates.name !== undefined) data.name = updates.name.trim().slice(0, 100);
  if (updates.alertFrequency !== undefined) data.alertFrequency = updates.alertFrequency;

  const updated = await updateSavedSearch(searchId, data);
  if (!updated) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }
  return updated;
}

/**
 * Deletes a saved search. Verifies ownership.
 * Throws 404 if not found, 403 if owned by another user.
 */
export async function deleteMySearch(userId: string, searchId: string): Promise<void> {
  const existing = await getSavedSearchById(searchId);
  if (!existing) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }
  if (existing.userId !== userId) {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }
  await deleteSavedSearch(searchId);
}

/**
 * Checks Redis dedup + throttle for instant alerts.
 * Returns true if the alert should fire, false if deduplicated or throttled.
 * Fail-open on Redis errors.
 */
export async function evaluateInstantAlert(
  savedSearch: PortalSavedSearch,
  newPosting: { id: string; title: string },
): Promise<boolean> {
  try {
    const redis = getRedisClient();

    // Dedup: check if this search has already alerted for this job
    const dedupKey = createRedisKey(
      "portal",
      "saved-search-alerted",
      `${savedSearch.id}:${newPosting.id}`,
    );
    const dedupResult = await redis.set(dedupKey, "1", "EX", INSTANT_ALERT_DEDUP_TTL_SECONDS, "NX");
    if (dedupResult === null) {
      // Already alerted for this job
      return false;
    }

    // Throttle: max 5 instant alerts per saved search per day
    const throttleKey = createRedisKey("portal", "saved-search-throttle", savedSearch.id);
    const count = await redis.incr(throttleKey);
    if (count === 1) {
      // First increment — set TTL
      await redis.expire(throttleKey, INSTANT_ALERT_THROTTLE_TTL_SECONDS);
    }
    if (count > INSTANT_ALERT_MAX_PER_DAY) {
      return false;
    }

    return true;
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.saved-search.instant-alert.redis-error",
        savedSearchId: savedSearch.id,
        jobId: newPosting.id,
        error: String(err),
      }),
    );
    // Fail-open: better to send a duplicate notification than to miss one
    return true;
  }
}

/**
 * In-memory filter to check if a posting matches a saved search's filters.
 * This is NOT a full FTS re-execution — it's a lightweight in-memory check.
 * False positives are acceptable for notifications (user clicks through to real search).
 */
export function matchesPostingAgainstSearch(
  posting: {
    title: string;
    requirements: string | null;
    location: string | null;
    employmentType: string;
    culturalContextJson?: Record<string, boolean> | null;
  },
  searchParams: JobSearchRequest,
): boolean {
  const f = searchParams.filters;

  // Query match: any whitespace-split word in the query appears as substring in title or requirements
  if (searchParams.query && searchParams.query.trim()) {
    const words = searchParams.query.trim().toLowerCase().split(/\s+/);
    const searchText = `${posting.title ?? ""} ${posting.requirements ?? ""}`.toLowerCase();
    const queryMatches = words.some((word) => searchText.includes(word));
    if (!queryMatches) return false;
  }

  if (!f) return true;

  // Location filter
  if (f.location && f.location.length > 0) {
    const postingLocation = (posting.location ?? "").toLowerCase();
    const locationMatches = f.location.some((loc) => postingLocation.includes(loc.toLowerCase()));
    if (!locationMatches) return false;
  }

  // Employment type filter
  if (f.employmentType && f.employmentType.length > 0) {
    if (!f.employmentType.includes(posting.employmentType as (typeof f.employmentType)[number])) {
      return false;
    }
  }

  // Cultural context filters
  const cc = posting.culturalContextJson ?? {};
  if (f.culturalContext?.diasporaFriendly === true && !cc["diasporaFriendly"]) return false;
  if (f.culturalContext?.igboPreferred === true && !cc["igboLanguagePreferred"]) return false;
  if (f.culturalContext?.communityReferred === true && !cc["communityReferred"]) return false;

  // Remote filter
  if (f.remote === true) {
    const isRemote =
      (posting.location ?? "").toLowerCase().includes("remote") || cc["diasporaFriendly"] === true;
    if (!isRemote) return false;
  }

  return true;
}

/**
 * Checks all instant-frequency saved searches against a newly activated posting.
 * Emits "saved_search.new_result" events for matches that pass dedup/throttle.
 */
export async function checkInstantAlerts(postingId: string): Promise<void> {
  // Load the minimal posting projection
  const { getJobPostingById } = await import("@igbo/db/queries/portal-job-postings");
  const posting = await getJobPostingById(postingId);
  if (!posting) return;

  const instantSearches = await getInstantAlertSearches();
  if (instantSearches.length === 0) return;

  await Promise.allSettled(
    instantSearches.map(async (savedSearch) => {
      const searchParams = savedSearch.searchParamsJson as JobSearchRequest;

      const matches = matchesPostingAgainstSearch(
        {
          title: posting.title,
          requirements: posting.requirements,
          location: posting.location,
          employmentType: posting.employmentType,
          culturalContextJson: posting.culturalContextJson as Record<string, boolean> | null,
        },
        searchParams,
      );

      if (!matches) return;

      portalEventBus.emit("saved_search.new_result", {
        savedSearchId: savedSearch.id,
        userId: savedSearch.userId,
        jobId: posting.id,
        jobTitle: posting.title,
        searchName: savedSearch.name,
        emittedBy: "saved-search-service",
      });
    }),
  );
}
