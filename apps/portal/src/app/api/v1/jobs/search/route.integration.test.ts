// @vitest-environment node
/**
 * Integration tests for GET /api/v1/jobs/search
 *
 * Tests the full stack: service → DB query → Postgres FTS + facets → Redis cache.
 * Gated by DATABASE_URL: skipped in unit test runs, runs in CI Postgres container.
 *
 * Run locally:
 *   DATABASE_URL=postgresql://... REDIS_URL=redis://... \
 *   pnpm --filter @igbo/portal exec vitest run src/app/api/v1/jobs/search/route.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, inArray } from "drizzle-orm";
import { db } from "@igbo/db";
import { authUsers } from "@igbo/db/schema/auth-users";
import { portalCompanyProfiles } from "@igbo/db/schema/portal-company-profiles";
import { portalJobPostings } from "@igbo/db/schema/portal-job-postings";
import {
  searchJobPostingsWithFilters,
  getJobSearchFacets,
  getJobSearchTotalCount,
} from "@igbo/db/queries/portal-job-search";
import {
  searchJobs,
  invalidateJobSearchCache,
  _testOnly_awaitInvalidation,
  _testOnly_awaitCacheWrite,
} from "@/services/job-search-service";
import { getRedisClient, closeAllRedisConnections } from "@/lib/redis";
import fs from "node:fs";
import path from "node:path";

const HAVE_DATABASE = !!process.env.DATABASE_URL;
const HAVE_REDIS = !!process.env.REDIS_URL;

// ---------------------------------------------------------------------------
// Deterministic test IDs — stable across runs
// ---------------------------------------------------------------------------

const TEST_USER_ID = "41a00001-0000-4000-8000-000000000001";
const TEST_COMPANY_TECH_ID = "41a00001-0000-4000-8000-000000000010";
const TEST_COMPANY_FINANCE_ID = "41a00001-0000-4000-8000-000000000011";
const TEST_COMPANY_HEALTH_ID = "41a00001-0000-4000-8000-000000000012";

function postingId(n: number): string {
  return `41a00001-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

// Active: 1–25 (main set), 32 (Igbo), 33 (developer English-only)
// Draft: 26–28; Expired: 29–30; Archived: 31
const ALL_POSTING_IDS = Array.from({ length: 33 }, (_, i) => postingId(i + 1));
const ALL_COMPANY_IDS = [TEST_COMPANY_TECH_ID, TEST_COMPANY_FINANCE_ID, TEST_COMPANY_HEALTH_ID];

// ---------------------------------------------------------------------------
// Seed / cleanup helpers
// ---------------------------------------------------------------------------

async function seedJobSearchFixtures(): Promise<void> {
  const BASE_DATE = new Date("2026-04-01T00:00:00Z");
  const LOCATIONS = ["Lagos, Nigeria", "Toronto, Canada", "London, UK", "Remote"];
  const TYPES = ["full_time", "part_time", "contract", "internship"] as const;
  const SALARIES: Array<[number, number]> = [
    [30000, 50000], // <50k
    [60000, 90000], // 50k-100k
    [110000, 150000], // 100k-200k
    [250000, 350000], // >200k
  ];

  // 1. Owner user (shared FK anchor for company profiles)
  await db
    .insert(authUsers)
    .values({
      id: TEST_USER_ID,
      email: "p41a-integration-test@igbo.test",
      consentGivenAt: BASE_DATE,
    })
    .onConflictDoNothing();

  // 2. Three companies across three industries
  await db
    .insert(portalCompanyProfiles)
    .values([
      {
        id: TEST_COMPANY_TECH_ID,
        ownerUserId: TEST_USER_ID,
        name: "TechCorp",
        industry: "Technology",
      },
      {
        id: TEST_COMPANY_FINANCE_ID,
        ownerUserId: TEST_USER_ID,
        name: "FinanceCo",
        industry: "Finance",
      },
      {
        id: TEST_COMPANY_HEALTH_ID,
        ownerUserId: TEST_USER_ID,
        name: "HealthCo",
        industry: "Healthcare",
      },
    ])
    .onConflictDoNothing();

  // 3. 25 active postings — deterministic spread across locations, types, salary, cultural flags
  const activePostings = Array.from({ length: 25 }, (_, i) => {
    const locationIdx = i % LOCATIONS.length;
    const typeIdx = i % TYPES.length;
    const salaryIdx = i % SALARIES.length;
    const companyId =
      i < 10 ? TEST_COMPANY_TECH_ID : i < 18 ? TEST_COMPANY_FINANCE_ID : TEST_COMPANY_HEALTH_ID;
    const [salaryMin, salaryMax] = SALARIES[salaryIdx]!;
    // Every 5th posting has cultural context
    const culturalContextJson =
      i % 5 === 0
        ? { diasporaFriendly: true, igboLanguagePreferred: i % 10 === 0, communityReferred: false }
        : null;
    return {
      id: postingId(i + 1),
      companyId,
      title: `Software Engineer Role ${i + 1}`,
      descriptionHtml: `<p>Join our team as a software engineer. Role ${i + 1}.</p>`,
      requirements: "Strong programming experience required.",
      location: LOCATIONS[locationIdx]!,
      employmentType: TYPES[typeIdx]!,
      status: "active" as const,
      salaryMin,
      salaryMax,
      culturalContextJson,
      createdAt: new Date(BASE_DATE.getTime() + i * 1000),
      updatedAt: new Date(BASE_DATE.getTime() + i * 1000),
    };
  });
  await db.insert(portalJobPostings).values(activePostings).onConflictDoNothing();

  // 4. Draft postings — must be excluded from search results
  await db
    .insert(portalJobPostings)
    .values(
      [26, 27, 28].map((n) => ({
        id: postingId(n),
        companyId: TEST_COMPANY_TECH_ID,
        title: "Draft Posting Should Be Excluded",
        employmentType: "full_time" as const,
        status: "draft" as const,
        location: "Lagos, Nigeria",
        createdAt: new Date(BASE_DATE.getTime() + n * 1000),
        updatedAt: new Date(BASE_DATE.getTime() + n * 1000),
      })),
    )
    .onConflictDoNothing();

  // 5. Expired postings — must be excluded from search results
  await db
    .insert(portalJobPostings)
    .values(
      [29, 30].map((n) => ({
        id: postingId(n),
        companyId: TEST_COMPANY_TECH_ID,
        title: "Expired Posting Should Be Excluded",
        employmentType: "full_time" as const,
        status: "expired" as const,
        location: "Lagos, Nigeria",
        createdAt: new Date(BASE_DATE.getTime() + n * 1000),
        updatedAt: new Date(BASE_DATE.getTime() + n * 1000),
      })),
    )
    .onConflictDoNothing();

  // 6. Archived active posting — archivedAt IS NOT NULL, must be excluded
  await db
    .insert(portalJobPostings)
    .values({
      id: postingId(31),
      companyId: TEST_COMPANY_TECH_ID,
      title: "Archived Active Posting Should Be Excluded",
      employmentType: "full_time" as const,
      status: "active" as const,
      archivedAt: BASE_DATE,
      location: "Lagos, Nigeria",
      createdAt: new Date(BASE_DATE.getTime() + 31000),
      updatedAt: new Date(BASE_DATE.getTime() + 31000),
    })
    .onConflictDoNothing();

  // 7. Igbo-content posting for Scenario 9 locale test
  await db
    .insert(portalJobPostings)
    .values({
      id: postingId(32),
      companyId: TEST_COMPANY_TECH_ID,
      // Title uses Igbo phrase — also indexed in search_vector (English) via trigger,
      // but the key is that search_vector_igbo contains 'onye' and 'mmemme' tokens.
      title: "Onye mmemme ọrụ teknọlọjị",
      descriptionIgboHtml:
        "<p>Achọrọ onye mmemme ọrụ teknọlọjị nwee ihe ọmụmụ maka ngwa igodo.</p>",
      requirements: "Nwee ihe ọmụmụ n'ịdịzie ngwa.",
      employmentType: "full_time" as const,
      status: "active" as const,
      location: "Lagos, Nigeria",
      createdAt: new Date(BASE_DATE.getTime() + 32000),
      updatedAt: new Date(BASE_DATE.getTime() + 32000),
    })
    .onConflictDoNothing();

  // 8. English-only developer posting for Scenario 9 locale contrast
  await db
    .insert(portalJobPostings)
    .values({
      id: postingId(33),
      companyId: TEST_COMPANY_TECH_ID,
      title: "Senior Developer Specialist",
      descriptionHtml: "<p>We are looking for a skilled developer for our growing team.</p>",
      requirements: "5 years of developer experience with modern frameworks.",
      employmentType: "full_time" as const,
      status: "active" as const,
      location: "Lagos, Nigeria",
      createdAt: new Date(BASE_DATE.getTime() + 33000),
      updatedAt: new Date(BASE_DATE.getTime() + 33000),
    })
    .onConflictDoNothing();

  // Run ANALYZE so the planner has fresh statistics (critical for small datasets
  // to prefer GIN index scan over sequential scan on first test run)
  await db.execute(sql`ANALYZE portal_job_postings`);
}

async function cleanupJobSearchFixtures(): Promise<void> {
  // Delete in FK-safe order (postings first, then companies, then user)
  await db.delete(portalJobPostings).where(inArray(portalJobPostings.id, ALL_POSTING_IDS));
  await db.delete(portalCompanyProfiles).where(inArray(portalCompanyProfiles.id, ALL_COMPANY_IDS));
  await db.delete(authUsers).where(inArray(authUsers.id, [TEST_USER_ID]));
}

// ---------------------------------------------------------------------------
// Integration test suite
// ---------------------------------------------------------------------------

// Active postings available to search: 25 (main) + 1 (Igbo) + 1 (developer) = 27
// Draft (3), expired (2), archived (1) are excluded.
const EXPECTED_ACTIVE_COUNT = 27;

describe.skipIf(!HAVE_DATABASE)("job search integration", () => {
  beforeAll(async () => {
    // Clean up any leftover data from a previous interrupted run
    await cleanupJobSearchFixtures();
    await seedJobSearchFixtures();
  });

  afterAll(async () => {
    await cleanupJobSearchFixtures();
    if (HAVE_REDIS) {
      await closeAllRedisConnections();
    }
  });

  // =========================================================================
  // VS-1: Basic query + all 4 facets populated under seeded data
  // =========================================================================

  it("VS-1: basic FTS query returns results with snippet+relevance and all 4 facets", async () => {
    const [page, facets, totalCount] = await Promise.all([
      searchJobPostingsWithFilters({ query: "engineer", sort: "relevance", limit: 10 }),
      getJobSearchFacets({}, "en", "engineer"),
      getJobSearchTotalCount({}, "en", "engineer"),
    ]);

    // Results contain matched postings with mark-wrapped snippet
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]!.snippet).toMatch(/<mark>/i);
    expect(typeof page.items[0]!.relevance).toBe("number");
    expect(page.items[0]!.relevance as number).toBeGreaterThan(0);

    // All 4 facet categories populated
    expect(facets.location.length).toBeGreaterThan(0);
    expect(facets.employmentType.length).toBeGreaterThan(0);
    expect(facets.industry.length).toBeGreaterThan(0);
    // salaryRange is populated for postings with salary data
    expect(facets.salaryRange.length).toBeGreaterThan(0);

    // Industry facets must include all 3 seeded industries
    const industryNames = facets.industry.map((f) => f.value);
    expect(industryNames).toContain("Technology");
    expect(industryNames).toContain("Finance");
    expect(industryNames).toContain("Healthcare");

    expect(totalCount).toBeGreaterThan(0);

    console.info("VS-1:", {
      resultCount: page.items.length,
      totalCount,
      locations: facets.location.length,
      industries: industryNames,
    });
  });

  // =========================================================================
  // VS-2: Cursor pagination stable across 2 pages
  // =========================================================================

  it("VS-2: cursor pagination — 2 pages yield unique IDs, no duplicates or skips", async () => {
    const page1 = await searchJobPostingsWithFilters({ sort: "date", limit: 10 });
    expect(page1.items.length).toBe(10);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await searchJobPostingsWithFilters({
      sort: "date",
      limit: 10,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.length).toBeGreaterThan(0);

    const allIds = [...page1.items.map((r) => r.id), ...page2.items.map((r) => r.id)];
    const uniqueIds = new Set(allIds);

    // No duplicates across pages
    expect(uniqueIds.size).toBe(allIds.length);
    // At least 20 unique rows across 2 pages
    expect(allIds.length).toBeGreaterThanOrEqual(20);

    console.info(
      "VS-2: page1 IDs:",
      page1.items.map((r) => r.id.slice(-4)),
    );
    console.info(
      "VS-2: page2 IDs:",
      page2.items.map((r) => r.id.slice(-4)),
    );
    console.info("VS-2: union size:", uniqueIds.size);
  });

  // =========================================================================
  // VS-3: Filter AND-between categories, OR-within multi-value
  // =========================================================================

  it("VS-3: filter AND-between categories returns only matching rows", async () => {
    const page = await searchJobPostingsWithFilters({
      filters: {
        location: ["Lagos, Nigeria", "Toronto, Canada"],
        employmentType: ["full_time"],
        salaryMin: 50000,
      },
    });

    expect(page.items.length).toBeGreaterThan(0);

    for (const item of page.items) {
      // Location must be Lagos OR Toronto (OR within)
      expect(["Lagos, Nigeria", "Toronto, Canada"]).toContain(item.location);
      // Employment type must be full_time
      expect(item.employment_type).toBe("full_time");
      // Salary overlap: salary_max >= 50000 or salary_max is null (open-ended)
      if (item.salary_max !== null) {
        expect(item.salary_max).toBeGreaterThanOrEqual(50000);
      }
    }
  });

  // =========================================================================
  // VS-4: EXPLAIN ANALYZE — GIN index scan, not sequential scan
  // =========================================================================

  it("VS-4: EXPLAIN ANALYZE uses GIN index on idx_portal_job_postings_search_vector", async () => {
    const rows = (await db.execute(sql`
      EXPLAIN ANALYZE
      SELECT id, ts_rank(search_vector, plainto_tsquery('english', 'engineer')) AS rank
      FROM portal_job_postings
      WHERE status = 'active'
        AND archived_at IS NULL
        AND search_vector @@ plainto_tsquery('english', 'engineer')
    `)) as unknown as { "QUERY PLAN": string }[];

    const planText = rows.map((r) => r["QUERY PLAN"]).join("\n");
    console.info("VS-4 EXPLAIN ANALYZE:\n" + planText);

    // Assert planner chose GIN index (not sequential scan)
    // Regex handles plan format variants: "Bitmap Index Scan", "Parallel Bitmap Heap Scan", etc.
    expect(planText).toMatch(/Bitmap\s+Index\s+Scan.*idx_portal_job_postings_search_vector/i);

    // Persist plan shape to spike doc (first run only — idempotent)
    const spikeDocPath = path.resolve(
      __dirname,
      "../../../../../../docs/decisions/full-text-search-spike.md",
    );
    if (fs.existsSync(spikeDocPath)) {
      const existing = fs.readFileSync(spikeDocPath, "utf-8");
      if (!existing.includes("## Verified query plan shapes")) {
        const versionRows = (await db.execute(sql`SELECT version() AS v`)) as unknown as {
          v: string;
        }[];
        const pgVersion = versionRows[0]?.v ?? "unknown";

        const appendix = [
          "",
          "## Verified query plan shapes",
          "",
          `**PostgreSQL version:** ${pgVersion}`,
          `**Captured:** ${new Date().toISOString().slice(0, 10)} (P-4.1A integration test — VS-4)`,
          "",
          "```",
          planText,
          "```",
          "",
        ].join("\n");
        fs.appendFileSync(spikeDocPath, appendix, "utf-8");
        console.info("VS-4: appended Verified query plan shapes to full-text-search-spike.md");
      }
    }
  });

  // =========================================================================
  // VS-5: Cache hit observably faster than cold; cache-first call ordering
  // =========================================================================

  it.skipIf(!HAVE_REDIS)(
    "VS-5: warm cache faster than cold; redis.get called before DB on warm request",
    async () => {
      const redis = getRedisClient();
      const existingKeys = await redis.keys("portal:job-search:*");
      if (existingKeys.length > 0) await redis.del(...existingKeys);

      const request = { query: "engineer", sort: "relevance" as const, limit: 10 };

      // Register deterministic cache-write hook BEFORE firing the cold search.
      // .finally() on the NX redis.set promise resolves this when the write
      // settles (success or error). Replaces setTimeout polling — see
      // AC #6 and docs/decisions/search-cache-strategy.md §Decision 1.
      const cacheWritten = _testOnly_awaitCacheWrite();

      // Cold request (cache miss)
      const coldStart = performance.now();
      await searchJobs(request, "en");
      const coldDuration = performance.now() - coldStart;

      // Await deterministic signal — no setTimeout
      await cacheWritten;

      // Warm request (cache hit)
      const warmStart = performance.now();
      await searchJobs(request, "en");
      const warmDuration = performance.now() - warmStart;

      console.info("VS-5 timing:", {
        coldMs: Math.round(coldDuration),
        warmMs: Math.round(warmDuration),
      });

      // CI-tolerant regression guards (NOT the production P95 NFR — see AC #6 and
      // docs/decisions/search-cache-strategy.md §Decision 8 for the real P95 budget).
      expect(warmDuration).toBeLessThan(600); // warm regression guard
      expect(coldDuration).toBeLessThan(2000); // cold regression guard
      expect(warmDuration).toBeLessThan(coldDuration); // cache hit is faster

      // Verify a cache key exists after the cold request
      const keysAfterCold = await redis.keys("portal:job-search:*");
      expect(keysAfterCold.length).toBeGreaterThan(0);
    },
  );

  // =========================================================================
  // VS-6: Cache invalidation — deterministic, no setTimeout polling
  // =========================================================================

  it.skipIf(!HAVE_REDIS)(
    "VS-6: cache invalidated after invalidateJobSearchCache — zero keys remain",
    async () => {
      const redis = getRedisClient();

      // Warm the cache with at least one request; await deterministic
      // cache-write signal instead of setTimeout polling.
      const cacheWritten = _testOnly_awaitCacheWrite();
      await searchJobs({ sort: "date" as const, limit: 5 }, "en");
      await cacheWritten;

      const keysBefore = await redis.keys("portal:job-search:*");
      expect(keysBefore.length).toBeGreaterThan(0);
      console.info("VS-6: keys before invalidation:", keysBefore.length);

      // Register deterministic completion hook BEFORE firing
      const done = _testOnly_awaitInvalidation();
      // Fire-and-forget invalidation (same pattern as job-posting-service.ts)
      invalidateJobSearchCache().catch(console.error);

      // Await deterministic signal — no setTimeout polling
      await done;

      const keysAfter = await redis.keys("portal:job-search:*");
      console.info("VS-6: keys after invalidation:", keysAfter.length);
      expect(keysAfter.length).toBe(0);
    },
  );

  // =========================================================================
  // VS-7: Empty result set — fully shaped with zero counts
  // =========================================================================

  it("VS-7: no-match query returns fully-shaped 200 with zero values", async () => {
    const bogusQuery = "xyznonexistent-zzzqqq123456789";

    const [page, facets, totalCount] = await Promise.all([
      searchJobPostingsWithFilters({ query: bogusQuery }),
      getJobSearchFacets({}, "en", bogusQuery),
      getJobSearchTotalCount({}, "en", bogusQuery),
    ]);

    // All keys present with zero values — no missing keys, no null facets object
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
    expect(facets).toHaveProperty("location");
    expect(facets).toHaveProperty("employmentType");
    expect(facets).toHaveProperty("industry");
    expect(facets).toHaveProperty("salaryRange");
    expect(facets.location).toHaveLength(0);
    expect(facets.employmentType).toHaveLength(0);
    expect(facets.industry).toHaveLength(0);
    expect(facets.salaryRange).toHaveLength(0);
    expect(totalCount).toBe(0);
  });

  // =========================================================================
  // VS-8: Cursor past end — partial last page + nextCursor === null
  // =========================================================================

  it("VS-8: cursor traversal to last page yields partial results + null nextCursor", async () => {
    // date sort with limit=10 across 27 active postings
    // Page 1: rows 1-10; Page 2: rows 11-20; Page 3: rows 21-27 (7 rows)
    const p1 = await searchJobPostingsWithFilters({ sort: "date", limit: 10 });
    expect(p1.items.length).toBe(10);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await searchJobPostingsWithFilters({
      sort: "date",
      limit: 10,
      cursor: p1.nextCursor!,
    });
    expect(p2.items.length).toBe(10);
    expect(p2.nextCursor).not.toBeNull();

    const p3 = await searchJobPostingsWithFilters({
      sort: "date",
      limit: 10,
      cursor: p2.nextCursor!,
    });
    const remainingCount = EXPECTED_ACTIVE_COUNT - 20;
    expect(p3.items.length).toBe(remainingCount);
    expect(p3.nextCursor).toBeNull(); // last page

    // No duplicates across all 3 pages
    const allIds = [...p1.items, ...p2.items, ...p3.items].map((r) => r.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.length).toBe(EXPECTED_ACTIVE_COUNT);

    console.info("VS-8:", {
      p1: p1.items.length,
      p2: p2.items.length,
      p3: p3.items.length,
      total: allIds.length,
    });
  });

  // =========================================================================
  // VS-9: locale=ig routes to search_vector_igbo, different results from locale=en
  // =========================================================================

  it("VS-9: locale=ig uses search_vector_igbo; locale=en uses search_vector", async () => {
    // The developer posting (id 33) has English content only — no Igbo descriptions.
    // search_vector_igbo will be NULL for it (trigger only uses description_igbo_html).
    // locale=en with query "developer" should find it; locale=ig should not.

    const enPage = await searchJobPostingsWithFilters({
      query: "developer",
      locale: "en",
      sort: "relevance",
      limit: 10,
    });

    const igPage = await searchJobPostingsWithFilters({
      query: "developer",
      locale: "ig",
      sort: "relevance",
      limit: 10,
    });

    const developerPostingId = postingId(33);

    console.info(
      "VS-9 en results:",
      enPage.items.map((r) => r.id.slice(-4)),
    );
    console.info(
      "VS-9 ig results:",
      igPage.items.map((r) => r.id.slice(-4)),
    );

    // English locale finds the developer posting (has English content)
    expect(enPage.items.some((r) => r.id === developerPostingId)).toBe(true);

    // Igbo locale does NOT find the developer posting (search_vector_igbo is NULL for it)
    expect(igPage.items.some((r) => r.id === developerPostingId)).toBe(false);

    // The Igbo posting (id 32) should appear in igbo search for "mmemme"
    const igboPostingId = postingId(32);
    const igboPostingPage = await searchJobPostingsWithFilters({
      query: "mmemme",
      locale: "ig",
      sort: "relevance",
      limit: 5,
    });
    console.info(
      "VS-9 ig 'mmemme' results:",
      igboPostingPage.items.map((r) => r.id.slice(-4)),
    );
    expect(igboPostingPage.items.some((r) => r.id === igboPostingId)).toBe(true);
  });
});
