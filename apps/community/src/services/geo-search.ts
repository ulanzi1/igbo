import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@igbo/db";
import { getBlockedUserIds, getUsersWhoBlocked } from "@igbo/db/queries/block-mute";

export const GEO_FALLBACK_THRESHOLD = 5; // exported for tests

export type GeoFallbackLevel = "city" | "state" | "country" | "global";

export interface GeoFallbackLevelCounts {
  city: number | null; // null when city param not provided
  state: number | null; // null when state param not provided
  country: number | null; // null when country param not provided
  global: number; // always populated
}

export interface GeoFallbackSearchParams {
  viewerUserId: string;
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;
  cursor?: string;
  limit?: number;
}

export interface GeoFallbackSearchResult {
  members: MemberCardData[];
  hasMore: boolean;
  nextCursor: string | null;
  activeLevel: GeoFallbackLevel;
  levelCounts: GeoFallbackLevelCounts;
  activeLocationLabel: string; // e.g. "Houston", "Texas", "United States", "the community"
}

export interface DirectorySearchParams {
  viewerUserId: string;
  query?: string; // FTS text search (name, bio, interests, location)
  locationCity?: string; // Text-based location filter
  locationState?: string;
  locationCountry?: string;
  interests?: string[]; // Array overlap filter on interests field
  language?: string; // Single language (array-contains filter)
  membershipTier?: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
  cursor?: string; // Opaque base64 cursor (encodes { createdAt, userId })
  limit?: number;
}

export interface MemberCardData {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  interests: string[];
  languages: string[];
  membershipTier: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
  bio: string | null;
  badgeType?: "blue" | "red" | "purple" | null;
}

export interface DirectorySearchResult {
  members: MemberCardData[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Encode cursor as opaque base64 JSON string. */
function encodeCursor(createdAt: Date, userId: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), userId })).toString(
    "base64url",
  );
}

/** Decode cursor or return null on invalid input. */
function decodeCursor(cursor: string): { createdAt: Date; userId: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as {
      createdAt: string;
      userId: string;
    };
    if (!parsed.createdAt || !parsed.userId) return null;
    return { createdAt: new Date(parsed.createdAt), userId: parsed.userId };
  } catch {
    return null;
  }
}

/**
 * Search the member directory with full-text, location, interests, language, and
 * tier filters. Enforces bidirectional block filtering and profile visibility rules.
 * Returns cursor-paginated results (newest first).
 */
export async function searchMembersInDirectory(
  params: DirectorySearchParams,
): Promise<DirectorySearchResult> {
  const {
    viewerUserId,
    query,
    locationCity,
    locationState,
    locationCountry,
    interests,
    language,
    membershipTier,
    cursor,
    limit: rawLimit,
  } = params;

  const safeLimit = Math.min(Math.max(1, rawLimit ?? 20), 50);

  // Bidirectional block filtering: load both directions then merge
  const [blockedByViewer, blockersOfViewer] = await Promise.all([
    getBlockedUserIds(viewerUserId),
    getUsersWhoBlocked(viewerUserId),
  ]);
  const allExcludedIds = [...new Set([...blockedByViewer, ...blockersOfViewer, viewerUserId])];

  // Decode cursor
  let cursorCreatedAt: Date | null = null;
  let cursorUserId: string | null = null;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      cursorCreatedAt = decoded.createdAt;
      cursorUserId = decoded.userId;
    }
  }

  const rows = await db.execute(sql`
    SELECT
      cp.user_id::text                        AS user_id,
      cp.display_name,
      cp.bio,
      cp.photo_url,
      CASE WHEN cp.location_visible THEN cp.location_city ELSE NULL END   AS location_city,
      CASE WHEN cp.location_visible THEN cp.location_state ELSE NULL END  AS location_state,
      CASE WHEN cp.location_visible THEN cp.location_country ELSE NULL END AS location_country,
      cp.interests,
      cp.languages,
      cp.created_at,
      au.membership_tier::text                AS membership_tier,
      cub.badge_type::text                    AS badge_type
    FROM community_profiles cp
    INNER JOIN auth_users au ON au.id = cp.user_id
    LEFT JOIN community_user_badges cub ON cub.user_id = cp.user_id
    WHERE cp.deleted_at IS NULL
      AND cp.profile_completed_at IS NOT NULL
      AND cp.profile_visibility != 'PRIVATE'
      ${
        allExcludedIds.length > 0
          ? sql`AND cp.user_id::text != ALL(${`{${allExcludedIds.join(",")}}`}::text[])`
          : sql``
      }
      ${
        query && query.trim().length >= 2
          ? sql`AND to_tsvector('english',
                  COALESCE(cp.display_name, '') || ' ' ||
                  COALESCE(cp.bio, '') || ' ' ||
                  COALESCE(cp.location_city, '') || ' ' ||
                  COALESCE(cp.location_state, '') || ' ' ||
                  COALESCE(cp.location_country, '') || ' ' ||
                  array_to_string(cp.interests, ' ') || ' ' ||
                  array_to_string(cp.languages, ' ')
                ) @@ plainto_tsquery('english', ${query.trim()})`
          : sql``
      }
      ${locationCity ? sql`AND cp.location_city ILIKE ${"%" + locationCity + "%"}` : sql``}
      ${locationState ? sql`AND cp.location_state ILIKE ${"%" + locationState + "%"}` : sql``}
      ${locationCountry ? sql`AND cp.location_country ILIKE ${"%" + locationCountry + "%"}` : sql``}
      ${
        interests && interests.length > 0
          ? sql`AND cp.interests && ARRAY[${sql.join(
              interests.map((i) => sql`${i}`),
              sql`, `,
            )}]::text[]`
          : sql``
      }
      ${language ? sql`AND cp.languages @> ARRAY[${language}]::text[]` : sql``}
      ${membershipTier ? sql`AND au.membership_tier = ${membershipTier}` : sql``}
      ${
        cursorCreatedAt && cursorUserId
          ? sql`AND (cp.created_at, cp.user_id::text) < (${cursorCreatedAt}, ${cursorUserId})`
          : sql``
      }
    ORDER BY cp.created_at DESC, cp.user_id DESC
    LIMIT ${safeLimit + 1}
  `);

  const allRows = rows as Array<Record<string, unknown>>;
  const hasMore = allRows.length > safeLimit;
  const pageRows = hasMore ? allRows.slice(0, safeLimit) : allRows;

  const members: MemberCardData[] = pageRows.map((row) => ({
    userId: String(row.user_id),
    displayName: String(row.display_name),
    bio: row.bio ? String(row.bio) : null,
    photoUrl: row.photo_url ? String(row.photo_url) : null,
    locationCity: row.location_city ? String(row.location_city) : null,
    locationState: row.location_state ? String(row.location_state) : null,
    locationCountry: row.location_country ? String(row.location_country) : null,
    interests: Array.isArray(row.interests) ? (row.interests as string[]) : [],
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
    membershipTier: String(row.membership_tier) as MemberCardData["membershipTier"],
    badgeType: row.badge_type ? (String(row.badge_type) as "blue" | "red" | "purple") : null,
  }));

  const lastRow = pageRows.at(-1);
  const nextCursor =
    hasMore && lastRow ? encodeCursor(lastRow.created_at as Date, String(lastRow.user_id)) : null;

  return { members, hasMore, nextCursor };
}

/**
 * Count members matching a specific geographic level predicate.
 * Applies base predicates (deleted_at, profile_completed_at, visibility, block exclusion)
 * but does NOT apply location_visible filter for counting — members count toward their
 * city regardless of whether they show location publicly.
 *
 * IMPORTANT: Pass exactly ONE geo param (city, state, or country) per call — or none
 * for a global count. Passing multiple geo params applies them as AND conditions,
 * which produces incorrect intersection counts rather than level-specific counts.
 */
async function countMembersAtLevel(params: {
  excludedIds: string[];
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;
}): Promise<number> {
  const { excludedIds, locationCity, locationState, locationCountry } = params;

  const rows = await db.execute(sql`
    SELECT COUNT(*) AS count
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
      ${locationCity ? sql`AND cp.location_city ILIKE ${"%" + locationCity + "%"}` : sql``}
      ${locationState ? sql`AND cp.location_state ILIKE ${"%" + locationState + "%"}` : sql``}
      ${locationCountry ? sql`AND cp.location_country ILIKE ${"%" + locationCountry + "%"}` : sql``}
  `);

  const row = (rows as Array<Record<string, unknown>>)[0];
  return Number(row?.count ?? 0);
}

/**
 * Search members with geographic fallback.
 * Automatically expands from city → state → country → global when fewer than
 * GEO_FALLBACK_THRESHOLD members are found at the more specific level.
 */
export async function searchMembersWithGeoFallback(
  params: GeoFallbackSearchParams,
): Promise<GeoFallbackSearchResult> {
  const {
    viewerUserId,
    locationCity,
    locationState,
    locationCountry,
    cursor,
    limit: rawLimit,
  } = params;

  const safeLimit = Math.min(Math.max(1, rawLimit ?? 12), 50);

  // Bidirectional block filtering
  const [blockedByViewer, blockersOfViewer] = await Promise.all([
    getBlockedUserIds(viewerUserId),
    getUsersWhoBlocked(viewerUserId),
  ]);
  const allExcludedIds = [...new Set([...blockedByViewer, ...blockersOfViewer, viewerUserId])];

  // Run all COUNT queries in parallel
  const [cityCount, stateCount, countryCount, globalCount] = await Promise.all([
    locationCity
      ? countMembersAtLevel({ excludedIds: allExcludedIds, locationCity })
      : Promise.resolve(null),
    locationState
      ? countMembersAtLevel({ excludedIds: allExcludedIds, locationState })
      : Promise.resolve(null),
    locationCountry
      ? countMembersAtLevel({ excludedIds: allExcludedIds, locationCountry })
      : Promise.resolve(null),
    countMembersAtLevel({ excludedIds: allExcludedIds }), // global: no geo filter
  ]);

  // Determine active level (first level meeting threshold)
  let activeLevel: GeoFallbackLevel;
  if (cityCount !== null && cityCount >= GEO_FALLBACK_THRESHOLD) {
    activeLevel = "city";
  } else if (stateCount !== null && stateCount >= GEO_FALLBACK_THRESHOLD) {
    activeLevel = "state";
  } else if (countryCount !== null && countryCount >= GEO_FALLBACK_THRESHOLD) {
    activeLevel = "country";
  } else {
    activeLevel = "global";
  }

  const levelCounts: GeoFallbackLevelCounts = {
    city: cityCount,
    state: stateCount,
    country: countryCount,
    global: globalCount,
  };

  // Compute label for active level
  let activeLocationLabel: string;
  if (activeLevel === "city") {
    activeLocationLabel = locationCity!;
  } else if (activeLevel === "state") {
    activeLocationLabel = locationState!;
  } else if (activeLevel === "country") {
    activeLocationLabel = locationCountry!;
  } else {
    activeLocationLabel = "the community"; // i18n handled client-side
  }

  // Build geo filter for the active level
  const activeCityFilter = activeLevel === "city" ? locationCity : undefined;
  const activeStateFilter = activeLevel === "state" ? locationState : undefined;
  const activeCountryFilter = activeLevel === "country" ? locationCountry : undefined;

  // Decode cursor
  let cursorCreatedAt: Date | null = null;
  let cursorUserId: string | null = null;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      cursorCreatedAt = decoded.createdAt;
      cursorUserId = decoded.userId;
    }
  }

  // Run paginated member query for the active level
  const rows = await db.execute(sql`
    SELECT
      cp.user_id::text                        AS user_id,
      cp.display_name,
      cp.bio,
      cp.photo_url,
      CASE WHEN cp.location_visible THEN cp.location_city ELSE NULL END   AS location_city,
      CASE WHEN cp.location_visible THEN cp.location_state ELSE NULL END  AS location_state,
      CASE WHEN cp.location_visible THEN cp.location_country ELSE NULL END AS location_country,
      cp.interests,
      cp.languages,
      cp.created_at,
      au.membership_tier::text                AS membership_tier,
      cub.badge_type::text                    AS badge_type
    FROM community_profiles cp
    INNER JOIN auth_users au ON au.id = cp.user_id
    LEFT JOIN community_user_badges cub ON cub.user_id = cp.user_id
    WHERE cp.deleted_at IS NULL
      AND cp.profile_completed_at IS NOT NULL
      AND cp.profile_visibility != 'PRIVATE'
      ${
        allExcludedIds.length > 0
          ? sql`AND cp.user_id::text != ALL(${`{${allExcludedIds.join(",")}}`}::text[])`
          : sql``
      }
      ${activeCityFilter ? sql`AND cp.location_city ILIKE ${"%" + activeCityFilter + "%"}` : sql``}
      ${activeStateFilter ? sql`AND cp.location_state ILIKE ${"%" + activeStateFilter + "%"}` : sql``}
      ${activeCountryFilter ? sql`AND cp.location_country ILIKE ${"%" + activeCountryFilter + "%"}` : sql``}
      ${
        cursorCreatedAt && cursorUserId
          ? sql`AND (cp.created_at, cp.user_id::text) < (${cursorCreatedAt}, ${cursorUserId})`
          : sql``
      }
    ORDER BY cp.created_at DESC, cp.user_id DESC
    LIMIT ${safeLimit + 1}
  `);

  const allRows = rows as Array<Record<string, unknown>>;
  const hasMore = allRows.length > safeLimit;
  const pageRows = hasMore ? allRows.slice(0, safeLimit) : allRows;

  const members: MemberCardData[] = pageRows.map((row) => ({
    userId: String(row.user_id),
    displayName: String(row.display_name),
    bio: row.bio ? String(row.bio) : null,
    photoUrl: row.photo_url ? String(row.photo_url) : null,
    locationCity: row.location_city ? String(row.location_city) : null,
    locationState: row.location_state ? String(row.location_state) : null,
    locationCountry: row.location_country ? String(row.location_country) : null,
    interests: Array.isArray(row.interests) ? (row.interests as string[]) : [],
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
    membershipTier: String(row.membership_tier) as MemberCardData["membershipTier"],
    badgeType: row.badge_type ? (String(row.badge_type) as "blue" | "red" | "purple") : null,
  }));

  const lastRow = pageRows.at(-1);
  const nextCursor =
    hasMore && lastRow ? encodeCursor(lastRow.created_at as Date, String(lastRow.user_id)) : null;

  return {
    members,
    hasMore,
    nextCursor,
    activeLevel,
    levelCounts,
    activeLocationLabel,
  };
}
