import "server-only";
import { db } from "@igbo/db";
import { sql } from "drizzle-orm";
import { getRedisClient } from "@/lib/redis";
import type { Redis } from "ioredis";
import type { MemberCardData } from "@/services/geo-search";

export const SUGGESTION_CACHE_TTL_SECONDS = 86_400; // 24 hours
export const SUGGESTION_DISMISS_TTL_SECONDS = 7_776_000; // 90 days (extends on each dismiss)
export const SUGGESTION_CANDIDATE_POOL = 20; // fetch 20 candidates, score in-memory, return top N

export type SuggestionReasonType = "city" | "state" | "country" | "interest" | "community";

export interface MemberSuggestion {
  member: MemberCardData;
  reasonType: SuggestionReasonType;
  reasonValue: string; // city/state/country name or interest name; "" for "community"
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function getAlreadyMessagedUserIds(viewerUserId: string): Promise<string[]> {
  // Direct conversations only (type = 'direct') — excludes group chats
  const rows = await db.execute(sql`
    SELECT DISTINCT cm2.user_id::text
    FROM chat_conversation_members cm1
    JOIN chat_conversations c ON c.id = cm1.conversation_id
    JOIN chat_conversation_members cm2
      ON cm2.conversation_id = c.id
      AND cm2.user_id != ${viewerUserId}::uuid
    WHERE cm1.user_id = ${viewerUserId}::uuid
      AND c.type = 'direct'
      AND c.deleted_at IS NULL
  `);
  return (rows as unknown as Array<{ user_id: string }>).map((r) => r.user_id);
}

async function getBidirectionalBlockIds(viewerUserId: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT blocker_user_id::text AS id FROM platform_blocked_users WHERE blocked_user_id = ${viewerUserId}::uuid
    UNION
    SELECT blocked_user_id::text AS id FROM platform_blocked_users WHERE blocker_user_id = ${viewerUserId}::uuid
  `);
  return (rows as unknown as Array<{ id: string }>).map((r) => r.id);
}

async function getDismissedUserIds(viewerUserId: string, redis: Redis): Promise<string[]> {
  // community-scope: raw Redis keys — VD-4 trigger not yet reached
  return redis.smembers(`suggestions:dismissed:${viewerUserId}`); // ci-allow-redis-key
}

interface CandidateRow {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  location_visible: boolean;
  interests: string[] | null;
  languages: string[] | null;
  bio: string | null;
  membership_tier: string;
}

async function getCandidates(excludedIds: string[], limit: number): Promise<CandidateRow[]> {
  const rows = await db.execute(sql`
    SELECT
      cp.user_id::text,
      cp.display_name,
      cp.photo_url,
      cp.location_city,
      cp.location_state,
      cp.location_country,
      cp.location_visible,
      cp.interests,
      cp.languages,
      cp.bio,
      au.membership_tier
    FROM community_profiles cp
    INNER JOIN auth_users au ON au.id = cp.user_id
    WHERE cp.deleted_at IS NULL
      AND cp.profile_completed_at IS NOT NULL
      AND cp.profile_visibility != 'PRIVATE'
      ${
        excludedIds.length > 0
          ? sql`AND cp.user_id::text != ALL(${`{${excludedIds.join(",")}}`}::text[])`
          : sql``
      }
    ORDER BY cp.profile_completed_at DESC, cp.user_id ASC
    LIMIT ${limit}
  `);
  return Array.from(rows) as unknown as CandidateRow[];
}

interface ViewerProfile {
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  interests: string[] | null;
}

function scoreCandidates(
  candidates: CandidateRow[],
  viewer: ViewerProfile,
): Array<{
  row: CandidateRow;
  score: number;
  reasonType: SuggestionReasonType;
  reasonValue: string;
}> {
  const viewerCity = viewer.location_city?.trim().toLowerCase() ?? null;
  const viewerState = viewer.location_state?.trim().toLowerCase() ?? null;
  const viewerCountry = viewer.location_country?.trim().toLowerCase() ?? null;
  const viewerInterests = viewer.interests ?? [];

  return candidates.map((row) => {
    const candidateCity = row.location_city?.trim().toLowerCase() ?? null;
    const candidateState = row.location_state?.trim().toLowerCase() ?? null;
    const candidateCountry = row.location_country?.trim().toLowerCase() ?? null;
    const candidateInterests = row.interests ?? [];

    let score = 0;
    let reasonType: SuggestionReasonType = "community";
    let reasonValue = "";

    const cityMatch = viewerCity && candidateCity && viewerCity === candidateCity;
    const stateMatch = viewerState && candidateState && viewerState === candidateState;
    const countryMatch = viewerCountry && candidateCountry && viewerCountry === candidateCountry;

    if (cityMatch) {
      score += 4;
    } else if (stateMatch) {
      score += 3;
    } else if (countryMatch) {
      score += 2;
    }

    // Shared interests — capped at +3 total
    const sharedInterests = viewerInterests.filter((i) =>
      candidateInterests.map((ci) => ci.toLowerCase()).includes(i.toLowerCase()),
    );
    const interestScore = Math.min(sharedInterests.length, 3);
    score += interestScore;

    // Determine reason (highest-priority geo match wins; interest only if no geo)
    if (cityMatch) {
      reasonType = "city";
      reasonValue = viewer.location_city!;
    } else if (stateMatch) {
      reasonType = "state";
      reasonValue = viewer.location_state!;
    } else if (countryMatch) {
      reasonType = "country";
      reasonValue = viewer.location_country!;
    } else if (sharedInterests.length > 0) {
      reasonType = "interest";
      reasonValue = sharedInterests[0] ?? "";
    } else {
      reasonType = "community";
      reasonValue = "";
    }

    return { row, score, reasonType, reasonValue };
  });
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * Returns personalized member suggestions for the viewer.
 * Results are cached in Redis for 24 hours.
 */
export async function getMemberSuggestions(
  viewerUserId: string,
  limit = 5,
): Promise<MemberSuggestion[]> {
  const redis = getRedisClient();
  const cacheKey = `suggestions:${viewerUserId}`; // ci-allow-redis-key

  // 1. Check Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as MemberSuggestion[];
  }

  // 2. Load viewer profile
  const profileRows = await db.execute(sql`
    SELECT location_city, location_state, location_country, interests
    FROM community_profiles
    WHERE user_id = ${viewerUserId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `);

  const profileArr = Array.from(profileRows) as unknown as ViewerProfile[];
  if (profileArr.length === 0) {
    return [];
  }

  const viewer = profileArr[0]!;

  // 3. Collect all excluded IDs in parallel
  const [messagedIds, blockedIds, dismissedIds] = await Promise.all([
    getAlreadyMessagedUserIds(viewerUserId),
    getBidirectionalBlockIds(viewerUserId),
    getDismissedUserIds(viewerUserId, redis),
  ]);

  const allExcludedIds = [
    ...new Set([...messagedIds, ...blockedIds, ...dismissedIds, viewerUserId]),
  ];

  // 4. Fetch candidate pool
  const candidates = await getCandidates(allExcludedIds, SUGGESTION_CANDIDATE_POOL);

  // 5. Score candidates
  const scored = scoreCandidates(candidates, viewer);

  // 6. Sort descending by score, take top `limit`
  scored.sort((a, b) => b.score - a.score || a.row.user_id.localeCompare(b.row.user_id));
  const top = scored.slice(0, limit);

  // 7. Map to MemberSuggestion (apply location_visible mask on MemberCardData)
  const result: MemberSuggestion[] = top.map(({ row, reasonType, reasonValue }) => {
    const card: MemberCardData = {
      userId: row.user_id,
      displayName: row.display_name,
      photoUrl: row.photo_url,
      locationCity: row.location_visible ? row.location_city : null,
      locationState: row.location_visible ? row.location_state : null,
      locationCountry: row.location_visible ? row.location_country : null,
      interests: row.interests ?? [],
      languages: row.languages ?? [],
      membershipTier: row.membership_tier as MemberCardData["membershipTier"],
      bio: row.bio,
    };
    return { member: card, reasonType, reasonValue };
  });

  // 8. Cache result
  await redis.set(cacheKey, JSON.stringify(result), "EX", SUGGESTION_CACHE_TTL_SECONDS);

  return result;
}

/**
 * Dismisses a suggestion for the viewer. Invalidates the cache so the next
 * fetch recomputes fresh suggestions without the dismissed member.
 */
export async function dismissSuggestion(
  viewerUserId: string,
  dismissedUserId: string,
): Promise<void> {
  const redis = getRedisClient();
  await redis.sadd(`suggestions:dismissed:${viewerUserId}`, dismissedUserId); // ci-allow-redis-key
  await redis.expire(`suggestions:dismissed:${viewerUserId}`, SUGGESTION_DISMISS_TTL_SECONDS); // ci-allow-redis-key
  // Invalidate suggestions cache so next fetch excludes the dismissed member
  await redis.del(`suggestions:${viewerUserId}`); // ci-allow-redis-key
}
