import "server-only";
import { createHash } from "node:crypto";
import { createRedisKey } from "@igbo/config/redis";
import { getRedisClient } from "@/lib/redis";
import { registerCacheNamespace, cachedFetch } from "@/lib/cache-registry";
import {
  searchJobPostingsWithFilters,
  getJobSearchFacets,
  getJobSearchTotalCount,
  getFeaturedJobPostings,
  getIndustryCategoryCounts,
  getRecentJobPostings,
  getSimilarJobPostings,
} from "@igbo/db/queries/portal-job-search";
import type {
  JobSearchFilters,
  DiscoveryJobResult,
  IndustryCategoryCount,
} from "@igbo/db/queries/portal-job-search";
import type {
  JobSearchRequest,
  JobSearchResponse,
  JobSearchResultItem,
  CulturalContextFlags,
} from "@/lib/validations/job-search";

// ---------------------------------------------------------------------------
// Cache group registrations — auto-registered for invalidation via cache-registry
// ---------------------------------------------------------------------------
registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
registerCacheNamespace("discovery", {
  patterns: [
    "portal:discovery:featured:*",
    "portal:discovery:categories:*",
    "portal:discovery:recent:*",
  ],
});
registerCacheNamespace("similar", { patterns: ["portal:discovery:similar:*"] });

// ---------------------------------------------------------------------------
// Cache TTL — 60 seconds (aligns with Redis EX and CDN s-maxage headers)
// See docs/decisions/search-cache-strategy.md §Decision 1
// ---------------------------------------------------------------------------
const CACHE_TTL_SECONDS = 60;

// ---------------------------------------------------------------------------
// Cache-write test-only hooks
// These EventEmitter-style signals let integration tests await
// fire-and-forget cache writes to complete without setTimeout polling.
//
// Runtime guard: hook throws when NODE_ENV === "production" to prevent
// accidental use in production code paths.
// ---------------------------------------------------------------------------
let _cacheWriteResolvers: Array<() => void> = [];

function _assertNotProduction(name: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name}() must not be called in production — it is a test-only hook.`);
  }
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
      companyId: row.company_id ?? null,
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
// Discovery page — P-4.2
// ---------------------------------------------------------------------------

// Locale-namespaced cache keys: data is currently locale-agnostic but discovery
// rendering may diverge per locale (e.g. localized industry labels), so cache
// per locale to avoid serving the wrong content if the projection changes.
// createRedisKey(app, domain, id) builds `app:domain:id`, so we pack the
// section + locale into the `id` segment to preserve the colon-namespaced layout.
function discoveryFeaturedKey(locale: string): string {
  return createRedisKey("portal", "discovery", `featured:${locale}`);
}
function discoveryCategoriesKey(locale: string): string {
  return createRedisKey("portal", "discovery", `categories:${locale}`);
}
function discoveryRecentKey(locale: string): string {
  return createRedisKey("portal", "discovery", `recent:${locale}`);
}
function discoverySimilarKey(jobId: string, locale: string): string {
  return createRedisKey("portal", "discovery", `similar:${jobId}:${locale}`);
}

const DISCOVERY_FEATURED_TTL = 60; // 1 minute
const DISCOVERY_CATEGORIES_TTL = 300; // 5 minutes
const DISCOVERY_RECENT_TTL = 120; // 2 minutes
const DISCOVERY_SIMILAR_TTL = 600; // 10 minutes (AC #3)

export interface DiscoveryPageData {
  featuredJobs: DiscoveryJobResult[];
  categories: IndustryCategoryCount[];
  recentPostings: DiscoveryJobResult[];
}

/**
 * Fetches all three discovery page data sets in parallel with per-query Redis caching.
 *
 * Uses Promise.allSettled so a failure in one query (e.g. Redis timeout on categories)
 * does not take down the entire page. Rejected results fall back to empty arrays.
 * Rejected results are logged at warn level for observability.
 *
 * Cache keys are locale-namespaced and TTLs:
 *   portal:discovery:featured:{locale}   — 60 s
 *   portal:discovery:categories:{locale} — 300 s
 *   portal:discovery:recent:{locale}     — 120 s
 */
export async function getDiscoveryPageData(locale: string): Promise<DiscoveryPageData> {
  const [featuredResult, categoriesResult, recentResult] = await Promise.allSettled([
    cachedFetch("discovery", discoveryFeaturedKey(locale), DISCOVERY_FEATURED_TTL, () =>
      getFeaturedJobPostings(6),
    ),
    cachedFetch("discovery", discoveryCategoriesKey(locale), DISCOVERY_CATEGORIES_TTL, () =>
      getIndustryCategoryCounts(),
    ),
    cachedFetch("discovery", discoveryRecentKey(locale), DISCOVERY_RECENT_TTL, () =>
      getRecentJobPostings(10),
    ),
  ]);

  if (featuredResult.status === "rejected") {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.job-search-service.discovery-featured-error",
        error: (featuredResult.reason as Error).message,
      }),
    );
  }
  if (categoriesResult.status === "rejected") {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.job-search-service.discovery-categories-error",
        error: (categoriesResult.reason as Error).message,
      }),
    );
  }
  if (recentResult.status === "rejected") {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.job-search-service.discovery-recent-error",
        error: (recentResult.reason as Error).message,
      }),
    );
  }

  return {
    featuredJobs: featuredResult.status === "fulfilled" ? featuredResult.value : [],
    categories: categoriesResult.status === "fulfilled" ? categoriesResult.value : [],
    recentPostings: recentResult.status === "fulfilled" ? recentResult.value : [],
  };
}

// ---------------------------------------------------------------------------
// Similar jobs — P-4.7
// ---------------------------------------------------------------------------

/**
 * Returns up to 6 similar job postings for the given job, with Redis caching.
 *
 * Cache key: portal:discovery:similar:{jobId}:{locale}  (10-minute TTL per AC #3)
 * Graceful degradation: on Redis error, falls through to DB query (no throw).
 */
export async function getSimilarJobs(
  jobId: string,
  companyIndustry: string,
  requirements: string | null,
  location: string | null,
  locale: string,
): Promise<DiscoveryJobResult[]> {
  const key = discoverySimilarKey(jobId, locale);
  try {
    return await cachedFetch("similar", key, DISCOVERY_SIMILAR_TTL, () =>
      getSimilarJobPostings(jobId, companyIndustry, requirements, location, 6),
    );
  } catch (err) {
    // Graceful degradation: Redis unavailable → fall back to DB query directly
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.job-search-service.similar-jobs-error",
        jobId,
        error: (err as Error).message,
      }),
    );
    return getSimilarJobPostings(jobId, companyIndustry, requirements, location, 6);
  }
}
