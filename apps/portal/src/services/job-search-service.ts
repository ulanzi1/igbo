import "server-only";
import { createHash } from "node:crypto";
import { createRedisKey } from "@igbo/config/redis";
import { getRedisClient } from "@/lib/redis";
import {
  searchJobPostingsWithFilters,
  getJobSearchFacets,
  getJobSearchTotalCount,
} from "@igbo/db/queries/portal-job-search";
import type { JobSearchFilters } from "@igbo/db/queries/portal-job-search";
import type {
  JobSearchRequest,
  JobSearchResponse,
  JobSearchResultItem,
  CulturalContextFlags,
} from "@/lib/validations/job-search";

// ---------------------------------------------------------------------------
// Cache TTL — 60 seconds (aligns with Redis EX and CDN s-maxage headers)
// See docs/decisions/search-cache-strategy.md §Decision 1
// ---------------------------------------------------------------------------
const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = "portal:job-search:";

// ---------------------------------------------------------------------------
// Cache invalidation / cache-write test-only hooks
// These EventEmitter-style signals let integration tests await invalidation
// and fire-and-forget cache writes to complete without setTimeout polling.
//
// Runtime guard: both hooks throw when NODE_ENV === "production" to prevent
// accidental use in production code paths.
// ---------------------------------------------------------------------------
let _invalidationResolvers: Array<() => void> = [];
let _cacheWriteResolvers: Array<() => void> = [];

function _assertNotProduction(name: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name}() must not be called in production — it is a test-only hook.`);
  }
}

/**
 * Test-only hook: resolves when the next invalidateJobSearchCache() completes.
 * Do NOT use in production code — for integration test determinism only.
 */
export function _testOnly_awaitInvalidation(): Promise<void> {
  _assertNotProduction("_testOnly_awaitInvalidation");
  return new Promise((resolve) => {
    _invalidationResolvers.push(resolve);
  });
}

/**
 * Test-only hook: resolves when the next fire-and-forget cache write completes
 * (settles — success or error). Lets integration tests avoid setTimeout polling
 * when asserting cache population after a cold search.
 * Do NOT use in production code.
 */
export function _testOnly_awaitCacheWrite(): Promise<void> {
  _assertNotProduction("_testOnly_awaitCacheWrite");
  return new Promise((resolve) => {
    _cacheWriteResolvers.push(resolve);
  });
}

function _notifyInvalidationComplete() {
  const resolvers = _invalidationResolvers;
  _invalidationResolvers = [];
  for (const resolve of resolvers) {
    resolve();
  }
}

function _notifyCacheWriteComplete() {
  const resolvers = _cacheWriteResolvers;
  _cacheWriteResolvers = [];
  for (const resolve of resolvers) {
    resolve();
  }
}

// ---------------------------------------------------------------------------
// Request normalization and hashing
// ---------------------------------------------------------------------------

/**
 * Produces a deterministic base64url hash for a search request + locale.
 * Canonical form: keys sorted, arrays sorted, query lowercased/trimmed,
 * empty arrays and undefined values omitted.
 *
 * Two semantically identical requests with different JSON key orderings
 * always produce the same hash — this prevents cache key fragmentation
 * from URL parameter ordering differences.
 */
export function normalizeAndHashRequest(request: JobSearchRequest, locale: string): string {
  const normalized = buildNormalizedCanonical(request, locale);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("base64url");
}

function sortedObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      if (val.length > 0) {
        result[key] = [...val].sort();
      }
    } else if (typeof val === "object") {
      const nested = sortedObject(val as Record<string, unknown>);
      if (Object.keys(nested).length > 0) result[key] = nested;
    } else {
      result[key] = val;
    }
  }
  return result;
}

function buildNormalizedCanonical(request: JobSearchRequest, locale: string): unknown {
  const query = request.query?.toLowerCase().trim() ?? "";
  const filters = request.filters ?? {};

  const canonical: Record<string, unknown> = {
    query,
    sort: request.sort ?? "relevance",
    limit: request.limit ?? 20,
    locale,
  };

  if (request.cursor) canonical.cursor = request.cursor;

  // Normalize filters
  const normalizedFilters: Record<string, unknown> = {};
  if (Array.isArray(filters.location) && filters.location.length > 0) {
    normalizedFilters.location = [...filters.location].sort();
  }
  if (typeof filters.salaryMin === "number") normalizedFilters.salaryMin = filters.salaryMin;
  if (typeof filters.salaryMax === "number") normalizedFilters.salaryMax = filters.salaryMax;
  if (Array.isArray(filters.employmentType) && filters.employmentType.length > 0) {
    normalizedFilters.employmentType = [...filters.employmentType].sort();
  }
  if (Array.isArray(filters.industry) && filters.industry.length > 0) {
    normalizedFilters.industry = [...filters.industry].sort();
  }
  if (typeof filters.remote === "boolean") normalizedFilters.remote = filters.remote;
  if (filters.culturalContext) {
    const cc = sortedObject(filters.culturalContext as unknown as Record<string, unknown>);
    if (Object.keys(cc).length > 0) normalizedFilters.culturalContext = cc;
  }

  if (Object.keys(normalizedFilters).length > 0) {
    canonical.filters = normalizedFilters;
  }

  return canonical;
}

// ---------------------------------------------------------------------------
// Cache key helper
// ---------------------------------------------------------------------------

function buildCacheKey(hash: string): string {
  return createRedisKey("portal", "job-search", hash);
}

// ---------------------------------------------------------------------------
// Main search entry point
// ---------------------------------------------------------------------------

/**
 * Searches job postings with full-text search, filters, facets, and Redis caching.
 *
 * Cache strategy: cache-aside with 60 s TTL + coarse invalidation on status change.
 * See docs/decisions/search-cache-strategy.md for full decision log.
 *
 * SECURITY: locale is server-derived from next-intl request context — NEVER read
 * from client input. Pass the resolved locale from getLocale() in the route handler.
 */
export async function searchJobs(
  request: JobSearchRequest,
  locale: "en" | "ig",
): Promise<JobSearchResponse> {
  const redis = getRedisClient();
  const hash = normalizeAndHashRequest(request, locale);
  const cacheKey = buildCacheKey(hash);

  // Cache read — return immediately on valid hit.
  // On parse failure (corrupted/poisoned cache entry), log and fall through
  // to the DB path so a single bad key doesn't 500 every subsequent request
  // until the TTL expires.
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as JobSearchResponse;
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.job-search-service.cache-parse-error",
          cacheKey,
          error: (err as Error).message,
        }),
      );
      // Best-effort eviction so the corrupted key stops re-poisoning.
      redis.del(cacheKey).catch(() => {
        // Swallow: worst case the key expires in ≤60s.
      });
      // Fall through to DB path below.
    }
  }

  // Cache miss — execute all 3 DB operations in parallel
  const filters: JobSearchFilters = {
    location: request.filters?.location,
    salaryMin: request.filters?.salaryMin,
    salaryMax: request.filters?.salaryMax,
    employmentType: request.filters?.employmentType,
    industry: request.filters?.industry,
    remote: request.filters?.remote,
    culturalContext: request.filters?.culturalContext
      ? {
          diasporaFriendly: request.filters.culturalContext.diasporaFriendly,
          igboPreferred: request.filters.culturalContext.igboPreferred,
          communityReferred: request.filters.culturalContext.communityReferred,
        }
      : undefined,
  };

  const [searchPage, facets, totalCount] = await Promise.all([
    searchJobPostingsWithFilters({
      query: request.query,
      locale,
      filters,
      sort: request.sort,
      cursor: request.cursor,
      limit: request.limit,
    }),
    getJobSearchFacets(filters, locale, request.query),
    getJobSearchTotalCount(filters, locale, request.query),
  ]);

  // Assemble response
  const response: JobSearchResponse = {
    results: searchPage.items.map((row) => ({
      id: row.id,
      title: row.title,
      companyName: row.company_name ?? "",
      companyLogoUrl: row.logo_url,
      location: row.location,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      salaryCompetitiveOnly: row.salary_competitive_only,
      employmentType: row.employment_type as JobSearchResultItem["employmentType"],
      culturalContext: row.cultural_context_json as CulturalContextFlags | null,
      applicationDeadline: row.application_deadline,
      createdAt: row.created_at,
      relevance: row.relevance,
      snippet: row.snippet,
    })),
    facets: {
      location: facets.location,
      employmentType: facets.employmentType,
      industry: facets.industry,
      salaryRange: facets.salaryRange,
    },
    pagination: {
      nextCursor: searchPage.nextCursor,
      totalCount,
      effectiveSort: searchPage.effectiveSort,
    },
  };

  // Cache write — NX so concurrent misses don't stomp each other.
  // Fire-and-forget: cache write failure degrades gracefully (next request will miss too).
  // See docs/decisions/search-cache-strategy.md §Decision 1.
  //
  // The .finally() fires the _testOnly_awaitCacheWrite signal after the write
  // settles (success OR error), giving integration tests a deterministic hook
  // without setTimeout polling.
  redis
    .set(cacheKey, JSON.stringify(response), "EX", CACHE_TTL_SECONDS, "NX")
    .catch((err: Error) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.job-search-service.cache-write-error",
          error: err.message,
        }),
      );
    })
    .finally(() => {
      _notifyCacheWriteComplete();
    });

  return response;
}

// ---------------------------------------------------------------------------
// Cache invalidation — fire-and-forget
// ---------------------------------------------------------------------------

/**
 * Scans and deletes all `portal:job-search:*` keys from Redis.
 *
 * Fire-and-forget: called after any status transition that changes which
 * postings appear in search results (active → filled, draft → active, etc.).
 * On Redis errors, logs and no-ops — cache will expire naturally in 60 s.
 *
 * Do NOT await this in callers — it is explicitly fire-and-forget.
 * See docs/decisions/search-cache-strategy.md §Decision 1.
 */
export async function invalidateJobSearchCache(): Promise<void> {
  const redis = getRedisClient();
  try {
    const pattern = `${CACHE_KEY_PREFIX}*`;
    let cursor = "0";
    const keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== "0");

    if (keysToDelete.length > 0) {
      // Delete in batches of 100 to avoid blocking Redis
      for (let i = 0; i < keysToDelete.length; i += 100) {
        const batch = keysToDelete.slice(i, i + 100);
        await redis.del(...batch);
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.job-search-service.invalidation-error",
        error: (err as Error).message,
      }),
    );
  } finally {
    // Notify integration test hooks that invalidation is complete (deterministic)
    _notifyInvalidationComplete();
  }
}
