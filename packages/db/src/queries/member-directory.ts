/**
 * @spike Member directory proximity queries — AI-5 Epic 2 retro action item.
 *
 * NOT wired to any production route yet. Validates that:
 *   1. The GiST index (0015_geocoding_gist_index.sql) is used correctly.
 *   2. The ranked-union fallback chain works end-to-end.
 *   3. The `ll_to_earth` / `earth_box` / `earth_distance` functions are available.
 *
 * TODO (Epic 3): Replace tiered fallback with a ranked-union CTE for large datasets.
 *   A single CTE is more efficient because it avoids N round-trips to the DB:
 *   ```sql
 *   WITH ranked AS (
 *     SELECT *, CASE WHEN earth_box(...) @> ll_to_earth(lat,lng) THEN 1
 *                    WHEN location_city ILIKE $city THEN 2
 *                    ... ELSE 5 END AS tier
 *     FROM community_profiles WHERE ...
 *   )
 *   SELECT * FROM ranked ORDER BY tier, earth_distance(...) LIMIT $limit;
 *   ```
 *
 * TODO (Epic 3): Add keyset pagination, block/mute filter, profile-visibility check.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../index";

export interface MemberDirectoryEntry {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  locationLat: number | null;
  locationLng: number | null;
  distanceM: number | null;
  /** Which fallback tier matched: 1=radius, 2=city, 3=state, 4=country, 5=global */
  tier: 1 | 2 | 3 | 4 | 5;
}

export interface SearchMembersParams {
  lat: number;
  lng: number;
  radiusM?: number;
  city?: string;
  state?: string;
  country?: string;
  limit?: number;
  /** Minimum results before falling back to the next tier */
  minResults?: number;
}

const DEFAULT_RADIUS_M = 50_000; // 50 km
const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_RESULTS = 5;

type RawRow = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  location_lat: string | null;
  location_lng: string | null;
  distance_m: string | null;
};

function mapRow(row: RawRow, tier: MemberDirectoryEntry["tier"]): MemberDirectoryEntry {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    locationCity: row.location_city,
    locationState: row.location_state,
    locationCountry: row.location_country,
    locationLat: row.location_lat != null ? parseFloat(row.location_lat) : null,
    locationLng: row.location_lng != null ? parseFloat(row.location_lng) : null,
    distanceM: row.distance_m != null ? parseFloat(row.distance_m) : null,
    tier,
  };
}

/**
 * Ranked-union proximity search with tiered fallback.
 *
 * Tries each tier in order and returns as soon as `minResults` are found:
 *   Tier 1 — within `radiusM` metres (uses GiST index via earth_box)
 *   Tier 2 — same city (ILIKE)
 *   Tier 3 — same state (ILIKE)
 *   Tier 4 — same country (ILIKE)
 *   Tier 5 — global (no location filter)
 *
 * All tiers exclude: deleted profiles, non-visible profiles.
 * Distance is only computed for tier 1; null for tiers 2–5.
 */
export async function searchMembersNearLocation(
  params: SearchMembersParams,
): Promise<MemberDirectoryEntry[]> {
  const {
    lat,
    lng,
    radiusM = DEFAULT_RADIUS_M,
    city,
    state,
    country,
    limit = DEFAULT_LIMIT,
    minResults = DEFAULT_MIN_RESULTS,
  } = params;

  const safeLimit = Math.min(Math.max(1, limit), 100);

  // ── Tier 1: radius (GiST index) ───────────────────────────────────────────
  const tier1Rows = (await db.execute(sql`
    SELECT
      cp.user_id::text,
      cp.display_name,
      cp.photo_url,
      cp.location_city,
      cp.location_state,
      cp.location_country,
      cp.location_lat::text,
      cp.location_lng::text,
      earth_distance(
        ll_to_earth(${lat}::float8, ${lng}::float8),
        ll_to_earth(cp.location_lat::float8, cp.location_lng::float8)
      )::text AS distance_m
    FROM community_profiles cp
    WHERE cp.deleted_at IS NULL
      AND cp.location_visible = true
      AND cp.location_lat IS NOT NULL
      AND cp.location_lng IS NOT NULL
      AND earth_box(ll_to_earth(${lat}::float8, ${lng}::float8), ${radiusM}::float8)
          @> ll_to_earth(cp.location_lat::float8, cp.location_lng::float8)
      AND earth_distance(
            ll_to_earth(${lat}::float8, ${lng}::float8),
            ll_to_earth(cp.location_lat::float8, cp.location_lng::float8)
          ) <= ${radiusM}::float8
    ORDER BY distance_m ASC
    LIMIT ${safeLimit}
  `)) as RawRow[];

  if (tier1Rows.length >= minResults) {
    return tier1Rows.map((r) => mapRow(r, 1));
  }

  // ── Tier 2: city ──────────────────────────────────────────────────────────
  if (city) {
    const tier2Rows = (await db.execute(sql`
      SELECT
        cp.user_id::text,
        cp.display_name,
        cp.photo_url,
        cp.location_city,
        cp.location_state,
        cp.location_country,
        cp.location_lat::text,
        cp.location_lng::text,
        NULL::text AS distance_m
      FROM community_profiles cp
      WHERE cp.deleted_at IS NULL
        AND cp.location_visible = true
        AND cp.location_city ILIKE ${city}
      ORDER BY cp.display_name ASC
      LIMIT ${safeLimit}
    `)) as RawRow[];

    if (tier2Rows.length >= minResults) {
      return tier2Rows.map((r) => mapRow(r, 2));
    }
  }

  // ── Tier 3: state ─────────────────────────────────────────────────────────
  if (state) {
    const tier3Rows = (await db.execute(sql`
      SELECT
        cp.user_id::text,
        cp.display_name,
        cp.photo_url,
        cp.location_city,
        cp.location_state,
        cp.location_country,
        cp.location_lat::text,
        cp.location_lng::text,
        NULL::text AS distance_m
      FROM community_profiles cp
      WHERE cp.deleted_at IS NULL
        AND cp.location_visible = true
        AND cp.location_state ILIKE ${state}
      ORDER BY cp.display_name ASC
      LIMIT ${safeLimit}
    `)) as RawRow[];

    if (tier3Rows.length >= minResults) {
      return tier3Rows.map((r) => mapRow(r, 3));
    }
  }

  // ── Tier 4: country ───────────────────────────────────────────────────────
  if (country) {
    const tier4Rows = (await db.execute(sql`
      SELECT
        cp.user_id::text,
        cp.display_name,
        cp.photo_url,
        cp.location_city,
        cp.location_state,
        cp.location_country,
        cp.location_lat::text,
        cp.location_lng::text,
        NULL::text AS distance_m
      FROM community_profiles cp
      WHERE cp.deleted_at IS NULL
        AND cp.location_visible = true
        AND cp.location_country ILIKE ${country}
      ORDER BY cp.display_name ASC
      LIMIT ${safeLimit}
    `)) as RawRow[];

    if (tier4Rows.length >= minResults) {
      return tier4Rows.map((r) => mapRow(r, 4));
    }
  }

  // ── Tier 5: global ────────────────────────────────────────────────────────
  const tier5Rows = (await db.execute(sql`
    SELECT
      cp.user_id::text,
      cp.display_name,
      cp.photo_url,
      cp.location_city,
      cp.location_state,
      cp.location_country,
      cp.location_lat::text,
      cp.location_lng::text,
      NULL::text AS distance_m
    FROM community_profiles cp
    WHERE cp.deleted_at IS NULL
      AND cp.location_visible = true
    ORDER BY cp.created_at DESC
    LIMIT ${safeLimit}
  `)) as RawRow[];

  return tier5Rows.map((r) => mapRow(r, 5));
}
