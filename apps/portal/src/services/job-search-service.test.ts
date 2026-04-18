// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis");
vi.mock("@igbo/db/queries/portal-job-search");

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisScan = vi.fn();
const mockRedisDel = vi.fn();

vi.mocked((await import("@/lib/redis")).getRedisClient).mockReturnValue({
  get: mockRedisGet,
  set: mockRedisSet,
  scan: mockRedisScan,
  del: mockRedisDel,
} as never);

const mockSearchJobPostingsWithFilters = vi.mocked(
  (await import("@igbo/db/queries/portal-job-search")).searchJobPostingsWithFilters,
);
const mockGetJobSearchFacets = vi.mocked(
  (await import("@igbo/db/queries/portal-job-search")).getJobSearchFacets,
);
const mockGetJobSearchTotalCount = vi.mocked(
  (await import("@igbo/db/queries/portal-job-search")).getJobSearchTotalCount,
);
const mockGetFeaturedJobPostings = vi.mocked(
  (await import("@igbo/db/queries/portal-job-search")).getFeaturedJobPostings,
);
const mockGetIndustryCategoryCounts = vi.mocked(
  (await import("@igbo/db/queries/portal-job-search")).getIndustryCategoryCounts,
);
const mockGetRecentJobPostings = vi.mocked(
  (await import("@igbo/db/queries/portal-job-search")).getRecentJobPostings,
);
const mockGetSimilarJobPostings = vi.mocked(
  (await import("@igbo/db/queries/portal-job-search")).getSimilarJobPostings,
);

import {
  searchJobs,
  normalizeAndHashRequest,
  invalidateJobSearchCache,
  getDiscoveryPageData,
  getSimilarJobs,
  _testOnly_awaitInvalidation,
  _testOnly_awaitCacheWrite,
} from "./job-search-service";
import type { JobSearchRequest } from "@/lib/validations/job-search";

const defaultRequest: JobSearchRequest = {
  query: "engineer",
  sort: "relevance",
  limit: 20,
};

const sampleSearchPage = {
  items: [
    {
      id: "post-1",
      title: "Software Engineer",
      company_name: "TechCorp",
      company_id: "company-uuid-1",
      logo_url: null,
      location: "Lagos, Nigeria",
      salary_min: 80000,
      salary_max: 120000,
      salary_competitive_only: false,
      employment_type: "full_time" as const,
      cultural_context_json: null,
      application_deadline: null,
      created_at: "2026-04-01T00:00:00.000Z",
      relevance: 0.85,
      snippet: "<mark>Software</mark> Engineer needed",
    },
  ],
  nextCursor: null,
  effectiveSort: "relevance" as const,
};

const sampleFacets = {
  location: [{ value: "Lagos, Nigeria", count: 3 }],
  employmentType: [{ value: "full_time", count: 5 }],
  industry: [{ value: "Technology", count: 2 }],
  salaryRange: [{ bucket: "50k-100k", count: 4 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisSet.mockResolvedValue("OK");
  mockRedisScan.mockResolvedValue(["0", []]);
  mockRedisDel.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// searchJobs — cache miss path
// ---------------------------------------------------------------------------

describe("searchJobs — cache miss", () => {
  it("calls DB layer on cache miss and returns assembled response", async () => {
    mockRedisGet.mockResolvedValue(null); // cache miss
    mockSearchJobPostingsWithFilters.mockResolvedValue(sampleSearchPage);
    mockGetJobSearchFacets.mockResolvedValue(sampleFacets);
    mockGetJobSearchTotalCount.mockResolvedValue(1);

    const result = await searchJobs(defaultRequest, "en");

    expect(mockSearchJobPostingsWithFilters).toHaveBeenCalledOnce();
    expect(mockGetJobSearchFacets).toHaveBeenCalledOnce();
    expect(mockGetJobSearchTotalCount).toHaveBeenCalledOnce();

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.companyName).toBe("TechCorp");
    expect(result.results[0]?.salaryMin).toBe(80000);
    expect(result.results[0]?.relevance).toBe(0.85);
    expect(result.facets).toEqual(sampleFacets);
    expect(result.pagination.totalCount).toBe(1);
    expect(result.pagination.nextCursor).toBeNull();
  });

  it("writes to Redis after DB hit (NX, EX 60)", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockSearchJobPostingsWithFilters.mockResolvedValue(sampleSearchPage);
    mockGetJobSearchFacets.mockResolvedValue(sampleFacets);
    mockGetJobSearchTotalCount.mockResolvedValue(1);

    await searchJobs(defaultRequest, "en");

    // Allow the fire-and-forget cache write to complete
    await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce());
    const [key, , exOption, ttl, nxOption] = mockRedisSet.mock.calls[0]!;
    expect(typeof key).toBe("string");
    expect(key).toContain("portal:job-search:");
    expect(exOption).toBe("EX");
    expect(ttl).toBe(60);
    expect(nxOption).toBe("NX");
  });
});

// ---------------------------------------------------------------------------
// searchJobs — cache hit path
// ---------------------------------------------------------------------------

describe("searchJobs — cache hit", () => {
  it("returns cached response and skips DB calls on cache hit", async () => {
    const cachedResponse = {
      results: [],
      facets: { location: [], employmentType: [], industry: [], salaryRange: [] },
      pagination: { nextCursor: null, totalCount: 5, effectiveSort: "relevance" as const },
    };
    mockRedisGet.mockResolvedValue(JSON.stringify(cachedResponse));

    const result = await searchJobs(defaultRequest, "en");

    expect(mockSearchJobPostingsWithFilters).not.toHaveBeenCalled();
    expect(mockGetJobSearchFacets).not.toHaveBeenCalled();
    expect(mockGetJobSearchTotalCount).not.toHaveBeenCalled();
    expect(result.pagination.totalCount).toBe(5);
  });

  it("calls redis.get before any DB function on warm request", async () => {
    const cachedResponse = {
      results: [],
      facets: { location: [], employmentType: [], industry: [], salaryRange: [] },
      pagination: { nextCursor: null, totalCount: 0, effectiveSort: "relevance" as const },
    };
    mockRedisGet.mockResolvedValue(JSON.stringify(cachedResponse));

    const callOrder: string[] = [];
    mockRedisGet.mockImplementation(async () => {
      callOrder.push("redis.get");
      return JSON.stringify(cachedResponse);
    });
    mockSearchJobPostingsWithFilters.mockImplementation(async () => {
      callOrder.push("db");
      return sampleSearchPage;
    });

    await searchJobs(defaultRequest, "en");

    expect(callOrder[0]).toBe("redis.get");
    expect(callOrder).not.toContain("db");
  });
});

// ---------------------------------------------------------------------------
// normalizeAndHashRequest — hash stability
// ---------------------------------------------------------------------------

describe("normalizeAndHashRequest — hash stability", () => {
  it("same hash for semantically equivalent requests regardless of key order", () => {
    const req1: JobSearchRequest = {
      query: "engineer",
      sort: "relevance",
      limit: 20,
      filters: { location: ["Lagos"], employmentType: ["full_time"] },
    };
    const req2: JobSearchRequest = {
      limit: 20,
      sort: "relevance",
      query: "engineer",
      filters: { employmentType: ["full_time"], location: ["Lagos"] },
    };

    const h1 = normalizeAndHashRequest(req1, "en");
    const h2 = normalizeAndHashRequest(req2, "en");
    expect(h1).toBe(h2);
  });

  it("different hash when query changes", () => {
    const req1: JobSearchRequest = { query: "engineer", sort: "relevance", limit: 20 };
    const req2: JobSearchRequest = { query: "developer", sort: "relevance", limit: 20 };

    expect(normalizeAndHashRequest(req1, "en")).not.toBe(normalizeAndHashRequest(req2, "en"));
  });

  it("different hash when locale changes", () => {
    const req: JobSearchRequest = { query: "engineer", sort: "relevance", limit: 20 };

    expect(normalizeAndHashRequest(req, "en")).not.toBe(normalizeAndHashRequest(req, "ig"));
  });

  it("same hash for array values regardless of order", () => {
    const req1: JobSearchRequest = {
      sort: "relevance",
      limit: 20,
      filters: { location: ["Lagos", "Toronto"] },
    };
    const req2: JobSearchRequest = {
      sort: "relevance",
      limit: 20,
      filters: { location: ["Toronto", "Lagos"] },
    };

    expect(normalizeAndHashRequest(req1, "en")).toBe(normalizeAndHashRequest(req2, "en"));
  });

  it("query is normalized to lowercase+trimmed before hashing", () => {
    const req1: JobSearchRequest = { query: "Engineer", sort: "relevance", limit: 20 };
    const req2: JobSearchRequest = { query: "  engineer  ", sort: "relevance", limit: 20 };
    const req3: JobSearchRequest = { query: "engineer", sort: "relevance", limit: 20 };

    const h1 = normalizeAndHashRequest(req1, "en");
    const h2 = normalizeAndHashRequest(req2, "en");
    const h3 = normalizeAndHashRequest(req3, "en");
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });
});

// ---------------------------------------------------------------------------
// invalidateJobSearchCache
// ---------------------------------------------------------------------------

describe("invalidateJobSearchCache", () => {
  it("scans for portal:job-search:* keys and deletes them", async () => {
    mockRedisScan.mockResolvedValue([
      "0",
      ["portal:job-search:abc123", "portal:job-search:def456"],
    ]);
    mockRedisDel.mockResolvedValue(2);

    await invalidateJobSearchCache();

    expect(mockRedisScan).toHaveBeenCalledWith("0", "MATCH", "portal:job-search:*", "COUNT", 100);
    expect(mockRedisDel).toHaveBeenCalledWith(
      "portal:job-search:abc123",
      "portal:job-search:def456",
    );
  });

  it("still deletes discovery keys even when no job-search scan keys are found", async () => {
    mockRedisScan.mockResolvedValue(["0", []]);

    await invalidateJobSearchCache();

    // Discovery keys are always deleted on invalidation (AC #7 — coarse invalidation).
    // Both en+ig variants are deleted because the cache is locale-namespaced.
    // Also includes the sitemap cache key (P-4.3B).
    expect(mockRedisDel).toHaveBeenCalledWith(
      "portal:discovery:featured:en",
      "portal:discovery:featured:ig",
      "portal:discovery:categories:en",
      "portal:discovery:categories:ig",
      "portal:discovery:recent:en",
      "portal:discovery:recent:ig",
      "portal:sitemap:urls",
    );
    // Only the one del call for discovery+sitemap keys (no scan-based keys)
    expect(mockRedisDel).toHaveBeenCalledTimes(1);
  });

  it("swallows Redis scan errors (logs but does not throw)", async () => {
    mockRedisScan.mockRejectedValue(new Error("Redis scan failed"));

    // Must not throw
    await expect(invalidateJobSearchCache()).resolves.toBeUndefined();
  });

  it("iterates cursor until cursor returns '0'", async () => {
    mockRedisScan
      .mockResolvedValueOnce(["42", ["portal:job-search:key1"]]) // first scan, cursor=42
      .mockResolvedValueOnce(["0", ["portal:job-search:key2"]]) // second scan, cursor=0 (end)
      .mockResolvedValueOnce(["0", []]); // third scan: similar:* pattern (empty)

    await invalidateJobSearchCache();

    // 3 total SCAN calls: 2 for portal:job-search:* cursor iteration + 1 for similar:*
    expect(mockRedisScan).toHaveBeenCalledTimes(3);
    expect(mockRedisDel).toHaveBeenCalledWith("portal:job-search:key1", "portal:job-search:key2");
  });
});

// ---------------------------------------------------------------------------
// Review-fix H2 — corrupt cache falls through to DB (never 500s)
// ---------------------------------------------------------------------------

describe("searchJobs — corrupt cache entry (review fix H2)", () => {
  it("falls through to DB when cached JSON is malformed, evicts the poisoned key", async () => {
    mockRedisGet.mockResolvedValue("not-valid-json{{{");
    mockSearchJobPostingsWithFilters.mockResolvedValue(sampleSearchPage);
    mockGetJobSearchFacets.mockResolvedValue(sampleFacets);
    mockGetJobSearchTotalCount.mockResolvedValue(1);

    const result = await searchJobs(defaultRequest, "en");

    // DB path was exercised despite cache containing garbage
    expect(mockSearchJobPostingsWithFilters).toHaveBeenCalledOnce();
    expect(result.results).toHaveLength(1);
    // Poisoned key was evicted (best-effort)
    expect(mockRedisDel).toHaveBeenCalledWith(expect.stringContaining("portal:job-search:"));
  });

  it("does not throw when cached value is a truncated JSON object", async () => {
    mockRedisGet.mockResolvedValue('{"results":[');
    mockSearchJobPostingsWithFilters.mockResolvedValue(sampleSearchPage);
    mockGetJobSearchFacets.mockResolvedValue(sampleFacets);
    mockGetJobSearchTotalCount.mockResolvedValue(1);

    await expect(searchJobs(defaultRequest, "en")).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Review-fix M4 — effectiveSort round-trip
// ---------------------------------------------------------------------------

describe("searchJobs — effectiveSort in response (review fix M4)", () => {
  it("returns effectiveSort matching the DB layer's fallback (relevance → date on empty query)", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockSearchJobPostingsWithFilters.mockResolvedValue({
      ...sampleSearchPage,
      effectiveSort: "date" as const,
    });
    mockGetJobSearchFacets.mockResolvedValue(sampleFacets);
    mockGetJobSearchTotalCount.mockResolvedValue(1);

    const result = await searchJobs({ sort: "relevance", limit: 20 }, "en");
    expect(result.pagination.effectiveSort).toBe("date");
  });

  it("returns effectiveSort === requested sort when no fallback applies", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockSearchJobPostingsWithFilters.mockResolvedValue({
      ...sampleSearchPage,
      effectiveSort: "salary_desc" as const,
    });
    mockGetJobSearchFacets.mockResolvedValue(sampleFacets);
    mockGetJobSearchTotalCount.mockResolvedValue(1);

    const result = await searchJobs({ sort: "salary_desc", limit: 20 }, "en");
    expect(result.pagination.effectiveSort).toBe("salary_desc");
  });
});

// ---------------------------------------------------------------------------
// Test-only hooks — production guard (addresses review finding L1)
// ---------------------------------------------------------------------------

describe("_testOnly_* hooks — production guard", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it("_testOnly_awaitInvalidation throws in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect(() => _testOnly_awaitInvalidation()).toThrow(/test-only hook/i);
  });

  it("_testOnly_awaitCacheWrite throws in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect(() => _testOnly_awaitCacheWrite()).toThrow(/test-only hook/i);
  });

  it("_testOnly_awaitCacheWrite resolves after the fire-and-forget NX set settles", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockSearchJobPostingsWithFilters.mockResolvedValue(sampleSearchPage);
    mockGetJobSearchFacets.mockResolvedValue(sampleFacets);
    mockGetJobSearchTotalCount.mockResolvedValue(1);
    let resolveSet: (v: unknown) => void = () => undefined;
    mockRedisSet.mockReturnValue(
      new Promise((r) => {
        resolveSet = r;
      }),
    );

    const written = _testOnly_awaitCacheWrite();
    await searchJobs(defaultRequest, "en");

    // Cache write is fire-and-forget; the signal resolves when the set settles.
    let writtenSettled = false;
    written.then(() => {
      writtenSettled = true;
    });
    // Signal should not fire until the NX set settles
    await Promise.resolve();
    expect(writtenSettled).toBe(false);
    resolveSet("OK");
    await written;
    expect(writtenSettled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shared sample data for discovery tests
// ---------------------------------------------------------------------------

const sampleDiscoveryJob = {
  id: "post-uuid-1",
  title: "Software Engineer",
  company_name: "TechCorp",
  company_id: "company-uuid-1",
  logo_url: null,
  location: "Lagos, Nigeria",
  salary_min: 80000,
  salary_max: 120000,
  salary_competitive_only: false,
  employment_type: "full_time" as const,
  cultural_context_json: null,
  application_deadline: null,
  created_at: "2026-04-01T00:00:00.000Z",
};

const sampleCategories = [
  { industry: "technology", count: 42 },
  { industry: "finance", count: 18 },
];

// ---------------------------------------------------------------------------
// getDiscoveryPageData — cache miss path
// ---------------------------------------------------------------------------

describe("getDiscoveryPageData — cache miss", () => {
  it("calls all three DB queries on cache miss and returns assembled data", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetFeaturedJobPostings.mockResolvedValue([sampleDiscoveryJob]);
    mockGetIndustryCategoryCounts.mockResolvedValue(sampleCategories);
    mockGetRecentJobPostings.mockResolvedValue([sampleDiscoveryJob]);

    const result = await getDiscoveryPageData("en");

    expect(mockGetFeaturedJobPostings).toHaveBeenCalledWith(6);
    expect(mockGetIndustryCategoryCounts).toHaveBeenCalledOnce();
    expect(mockGetRecentJobPostings).toHaveBeenCalledWith(10);

    expect(result.featuredJobs).toHaveLength(1);
    expect(result.categories).toHaveLength(2);
    expect(result.recentPostings).toHaveLength(1);
  });

  it("writes to Redis after DB hit for each query (NX EX)", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetFeaturedJobPostings.mockResolvedValue([sampleDiscoveryJob]);
    mockGetIndustryCategoryCounts.mockResolvedValue(sampleCategories);
    mockGetRecentJobPostings.mockResolvedValue([sampleDiscoveryJob]);

    await getDiscoveryPageData("en");

    await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledTimes(3));

    const setCalls = mockRedisSet.mock.calls;
    const keys = setCalls.map((c) => c[0] as string);
    // Cache keys are locale-namespaced (HIGH-4 review fix)
    expect(keys).toContain("portal:discovery:featured:en");
    expect(keys).toContain("portal:discovery:categories:en");
    expect(keys).toContain("portal:discovery:recent:en");

    // Verify TTLs
    const featuredCall = setCalls.find((c) => c[0] === "portal:discovery:featured:en")!;
    expect(featuredCall[2]).toBe("EX");
    expect(featuredCall[3]).toBe(60);
    expect(featuredCall[4]).toBe("NX");

    const categoriesCall = setCalls.find((c) => c[0] === "portal:discovery:categories:en")!;
    expect(categoriesCall[3]).toBe(300);

    const recentCall = setCalls.find((c) => c[0] === "portal:discovery:recent:en")!;
    expect(recentCall[3]).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// getDiscoveryPageData — cache hit path
// ---------------------------------------------------------------------------

describe("getDiscoveryPageData — cache hit", () => {
  it("returns cached data and skips DB queries on cache hit", async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify([sampleDiscoveryJob]));

    const result = await getDiscoveryPageData("en");

    expect(mockGetFeaturedJobPostings).not.toHaveBeenCalled();
    expect(mockGetIndustryCategoryCounts).not.toHaveBeenCalled();
    expect(mockGetRecentJobPostings).not.toHaveBeenCalled();

    expect(result.featuredJobs).toHaveLength(1);
    expect(result.categories).toHaveLength(1);
    expect(result.recentPostings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getDiscoveryPageData — resilience (Promise.allSettled)
// ---------------------------------------------------------------------------

describe("getDiscoveryPageData — resilience", () => {
  it("returns empty featuredJobs when getFeaturedJobPostings rejects", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetFeaturedJobPostings.mockRejectedValue(new Error("DB error"));
    mockGetIndustryCategoryCounts.mockResolvedValue(sampleCategories);
    mockGetRecentJobPostings.mockResolvedValue([sampleDiscoveryJob]);

    const result = await getDiscoveryPageData("en");

    expect(result.featuredJobs).toHaveLength(0);
    expect(result.categories).toHaveLength(2);
    expect(result.recentPostings).toHaveLength(1);
  });

  it("returns empty categories when getIndustryCategoryCounts rejects", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetFeaturedJobPostings.mockResolvedValue([sampleDiscoveryJob]);
    mockGetIndustryCategoryCounts.mockRejectedValue(new Error("DB timeout"));
    mockGetRecentJobPostings.mockResolvedValue([sampleDiscoveryJob]);

    const result = await getDiscoveryPageData("en");

    expect(result.featuredJobs).toHaveLength(1);
    expect(result.categories).toHaveLength(0);
    expect(result.recentPostings).toHaveLength(1);
  });

  it("returns empty recentPostings when getRecentJobPostings rejects", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetFeaturedJobPostings.mockResolvedValue([sampleDiscoveryJob]);
    mockGetIndustryCategoryCounts.mockResolvedValue(sampleCategories);
    mockGetRecentJobPostings.mockRejectedValue(new Error("Redis timeout"));

    const result = await getDiscoveryPageData("en");

    expect(result.featuredJobs).toHaveLength(1);
    expect(result.categories).toHaveLength(2);
    expect(result.recentPostings).toHaveLength(0);
  });

  it("does not throw when all three queries reject", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetFeaturedJobPostings.mockRejectedValue(new Error("error"));
    mockGetIndustryCategoryCounts.mockRejectedValue(new Error("error"));
    mockGetRecentJobPostings.mockRejectedValue(new Error("error"));

    await expect(getDiscoveryPageData("en")).resolves.toEqual({
      featuredJobs: [],
      categories: [],
      recentPostings: [],
    });
  });
});

// ---------------------------------------------------------------------------
// invalidateJobSearchCache — extended to delete discovery keys (AC #7)
// ---------------------------------------------------------------------------

describe("invalidateJobSearchCache — discovery key invalidation", () => {
  it("deletes discovery keys (both locales) in addition to job-search scan keys", async () => {
    mockRedisScan.mockResolvedValue(["0", []]);
    mockRedisDel.mockResolvedValue(6);

    await invalidateJobSearchCache();

    // Cache is locale-namespaced (HIGH-4 review fix), so both en+ig variants
    // are invalidated. Also includes sitemap cache key (P-4.3B).
    expect(mockRedisDel).toHaveBeenCalledWith(
      "portal:discovery:featured:en",
      "portal:discovery:featured:ig",
      "portal:discovery:categories:en",
      "portal:discovery:categories:ig",
      "portal:discovery:recent:en",
      "portal:discovery:recent:ig",
      "portal:sitemap:urls",
    );
  });

  it("deletes both scan-found keys and discovery keys when scan returns results", async () => {
    mockRedisScan.mockResolvedValue(["0", ["portal:job-search:abc"]]);
    mockRedisDel.mockResolvedValue(1);

    await invalidateJobSearchCache();

    // First del call: the scanned key
    expect(mockRedisDel).toHaveBeenCalledWith("portal:job-search:abc");
    // Second del call: discovery + sitemap keys for both locales
    expect(mockRedisDel).toHaveBeenCalledWith(
      "portal:discovery:featured:en",
      "portal:discovery:featured:ig",
      "portal:discovery:categories:en",
      "portal:discovery:categories:ig",
      "portal:discovery:recent:en",
      "portal:discovery:recent:ig",
      "portal:sitemap:urls",
    );
  });

  it("includes portal:sitemap:urls key in invalidation (P-4.3B)", async () => {
    mockRedisScan.mockResolvedValue(["0", []]);

    await invalidateJobSearchCache();

    // The sitemap cache key must be among the keys passed to del
    const delCalls = (mockRedisDel as ReturnType<typeof vi.fn>).mock.calls;
    const allDeletedKeys = delCalls.flat();
    expect(allDeletedKeys).toContain("portal:sitemap:urls");
  });
});

// ---------------------------------------------------------------------------
// getDiscoveryPageData — corrupt cache eviction (review fix HIGH-2)
// ---------------------------------------------------------------------------

describe("getDiscoveryPageData — corrupt cache entry", () => {
  it("falls through to DB when a discovery cache entry is malformed JSON, evicts the poisoned key", async () => {
    // First get returns garbage, subsequent gets return null so other queries miss cleanly.
    mockRedisGet.mockResolvedValueOnce("not-valid-json{{{").mockResolvedValue(null);
    mockGetFeaturedJobPostings.mockResolvedValue([sampleDiscoveryJob]);
    mockGetIndustryCategoryCounts.mockResolvedValue(sampleCategories);
    mockGetRecentJobPostings.mockResolvedValue([sampleDiscoveryJob]);

    const result = await getDiscoveryPageData("en");

    // DB path was exercised despite cache containing garbage
    expect(mockGetFeaturedJobPostings).toHaveBeenCalledOnce();
    expect(result.featuredJobs).toHaveLength(1);
    // Poisoned key was evicted (best-effort) — at least one del call against a discovery key
    expect(mockRedisDel).toHaveBeenCalledWith(expect.stringContaining("portal:discovery:"));
  });
});

// ---------------------------------------------------------------------------
// getSimilarJobs — P-4.7
// ---------------------------------------------------------------------------

const sampleSimilarJob = {
  id: "similar-post-1",
  title: "Frontend Engineer",
  company_name: "Acme Corp",
  company_id: "company-1",
  logo_url: null,
  location: "Lagos, Nigeria",
  salary_min: 60000,
  salary_max: 90000,
  salary_competitive_only: false,
  employment_type: "full_time",
  cultural_context_json: null,
  application_deadline: null,
  created_at: "2026-04-10T00:00:00Z",
};

describe("getSimilarJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisScan.mockResolvedValue(["0", []]);
    mockRedisDel.mockResolvedValue(1);
  });

  it("cache miss: calls DB query and writes to Redis cache", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetSimilarJobPostings.mockResolvedValue([sampleSimilarJob]);

    const result = await getSimilarJobs("job-1", "Technology", "React TypeScript", "Lagos", "en");

    expect(mockGetSimilarJobPostings).toHaveBeenCalledWith(
      "job-1",
      "Technology",
      "React TypeScript",
      "Lagos",
      6,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("similar-post-1");
    // Cache write (fire-and-forget)
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining("similar:job-1:en"),
      expect.any(String),
      "EX",
      600,
      "NX",
    );
  });

  it("cache hit: returns cached data without calling DB", async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify([sampleSimilarJob]));

    const result = await getSimilarJobs("job-1", "Technology", null, null, "en");

    expect(mockGetSimilarJobPostings).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("similar-post-1");
  });

  it("Redis error on get: falls through to DB query without throwing", async () => {
    mockRedisGet.mockRejectedValue(new Error("Redis connection refused"));
    mockGetSimilarJobPostings.mockResolvedValue([sampleSimilarJob]);

    const result = await getSimilarJobs("job-1", "Technology", null, null, "en");

    expect(mockGetSimilarJobPostings).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
  });

  it("returns empty array when DB returns no similar jobs", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetSimilarJobPostings.mockResolvedValue([]);

    const result = await getSimilarJobs("job-1", "Technology", null, null, "ig");

    expect(result).toEqual([]);
  });
});

describe("invalidateJobSearchCache — similar jobs keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisDel.mockResolvedValue(1);
  });

  it("scans and deletes portal:discovery:similar:* keys", async () => {
    // First SCAN call (job-search:* pattern) returns empty
    // Second SCAN call (similar:* pattern) returns a similar jobs key
    mockRedisScan
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", ["portal:discovery:similar:job-1:en"]]);

    await invalidateJobSearchCache();

    const deletedKeys = mockRedisDel.mock.calls.flat();
    expect(deletedKeys).toContain("portal:discovery:similar:job-1:en");
  });
});
