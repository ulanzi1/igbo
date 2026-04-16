# Search Cache Strategy — P-4.1A Decisions

**Status:** Accepted
**Date:** 2026-04-16
**Authors:** Dev (P-4.1A implementation)
**Story:** p-4-1a-full-text-search-backend-api-contract
**Gates:** P-4.1B (Search UI), P-4.2 (Discovery Page), P-4.6 (Saved Searches), P-4.7 (Similar Jobs)

---

## Context

P-4.1A delivers the `GET /api/v1/jobs/search` API contract consumed by all search surfaces in the
portal. Several design decisions were deferred from PREP-F/PREP-G to this story, particularly around
the Redis cache strategy, filter semantics, and performance assertion approach. This document
records those decisions.

---

## Decision 1: Cache-aside with 60 s TTL + coarse invalidation on status change

**Decision:** Use cache-aside (read-through on miss, write on miss) with a 60-second TTL. On any
`portal_job_postings` status transition that affects active postings, scan and delete all
`portal:job-search:*` keys as a fire-and-forget background operation.

**Rationale:**

- **Status changes are rare vs. search hits.** Search is read-heavy (many concurrent readers),
  status changes are rare (employer actions). Write-through or write-invalidate on every mutation
  would add no meaningful benefit on this read:write ratio.
- **60 s TTL is the safety net.** Even if invalidation fails (Redis timeout, network blip), the
  worst case is a 60 s stale window. For job postings this is acceptable: a filled posting appearing
  for 60 s does not cause user harm.
- **Fire-and-forget after the write commits.** Cache invalidation is NOT on the critical path. The
  status-change handler returns to the client as soon as the DB write commits. Invalidation runs
  asynchronously. If it fails, we log and move on — the TTL will expire the stale entry.
- **Pattern precedent:** Matches the existing `job-analytics-service.ts` fire-and-forget Redis
  pattern in the portal.

**Coarse invalidation:** `SCAN MATCH "portal:job-search:*"` + `DEL` all matching keys. We do NOT
do targeted per-query invalidation (that would require tracking which queries are affected by which
posting — O(n) cache management for O(1) benefit at current scale).

**Deterministic integration test hook:** `_testOnly_awaitInvalidation()` returns a Promise that
resolves when the next `invalidateJobSearchCache()` call completes. This gives integration tests a
deterministic signal without `setTimeout` polling — the 2% CI flake class that polling produces.

**NX write flag:** On cache miss, `redis.set(key, value, "EX", 60, "NX")`. The NX flag (set only
if not exists) prevents concurrent cache misses from all writing the same key, avoiding a write
storm after invalidation clears the cache when many readers hit simultaneously.

**CDN `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=30` — intentional:**

- `s-maxage=60` matches the Redis TTL so shared caches (CDN, Vercel edge) never serve content
  older than a single Redis cache generation.
- `stale-while-revalidate=30` grants an EXTRA 30 s window during which the CDN may serve a
  stale response while asynchronously refreshing from the origin. This raises the total
  worst-case staleness from 60 s (Redis only) to 90 s (Redis TTL + CDN swr).
- **Trade-off accepted:** filled postings may appear in CDN-cached search results for up to
  90 s after status change — the same community-level tolerance already documented for the
  Redis-only 60 s window. Cache invalidation is a Redis-layer concern (see above); CDN
  purging is deliberately NOT triggered on status change because:
  1. CDN purge APIs are provider-specific and add a failure mode to every status transition.
  2. The 90 s window is bounded and user-visible harm is negligible (seeker sees a posting,
     clicks, sees an up-to-date detail page which is NOT cached this way).
  3. `stale-while-revalidate` materially improves p99 latency during invalidation by avoiding
     synchronous CDN-miss → Redis-miss → DB cascade for the first requester after a purge.
- If product requires tighter staleness, reduce to `stale-while-revalidate=0` (swr disabled)
  at the cost of a brief latency spike after each invalidation. A `stale-if-error` variant
  was rejected because our origin errors are rare enough that stale-fallback is not worth
  complicating the cache semantics.

---

## Decision 2: Redis key hash strategy — canonical JSON sha256 → base64url

**Decision:** The cache key is `portal:job-search:<hash>` where `<hash>` is the sha256 of a
canonical JSON representation of the (normalized request, locale) pair, encoded as base64url.

**Canonical normalization rules:**

1. Object keys sorted alphabetically (recursively)
2. Array values sorted (location[], employmentType[], industry[])
3. `query` lowercased and trimmed
4. `limit` and `sort` included with their defaults applied
5. `locale` included as a separate field
6. Empty arrays and undefined values omitted

**Rationale:**

- A user bookmarks `?location=Lagos&location=Toronto` and another user sends `?location=Toronto&location=Lagos`.
  Without normalization, these would be different cache keys but return identical results. The 22-char
  base64url hash binds to semantic equivalence, not URL order.
- sha256 → base64url: 22 bytes (no URL-encoding needed). Bounded key size regardless of request
  complexity. Collision probability is negligible for this use case.
- `createRedisKey("portal", "job-search", hash)` uses the `@igbo/config/redis` utility for
  consistent namespace formatting across the portal.

**Unit test:** `normalizeAndHashRequest` is exported and directly tested with semantically equivalent
requests in different JSON key orders — confirmed to produce the same hash.

---

## Decision 3: Facet exclusion semantics — "click a facet never yields zero"

**Decision:** Facet counts reflect "how many active postings match the search + all OTHER active
filters, grouped by this facet's values". The facet being aggregated excludes its own filter
predicate from the WHERE clause.

**Implementation:** `buildFilterPredicate(filters, locale, excludeFacet?)` accepts an optional
`excludeFacet` parameter. `getJobSearchFacets` runs 4 parallel queries, each passing the facet
being aggregated as `excludeFacet`.

**Example:** User has selected `location=Lagos`. The `location` facet count query excludes the
location filter, so the counts reflect "total active postings per location matching OTHER filters".
This way, clicking "Toronto" (which shows count=5) always yields exactly 5 results — not zero.

**Rationale:** Standard faceted-search UX. A facet that can show count > 0 but return 0 results on
click violates the implicit UI contract and causes user confusion. Self-exclusion prevents this.

**Cost:** 4 extra DB queries per search (one per facet). At current scale (< 10K postings) this is
acceptable. Each facet query is a simple GROUP BY aggregation with the same WHERE clause as the
main query.

---

## Decision 4: Salary-range filter as overlap predicate (open-ended NULLs match any bound)

**Decision:** Salary filtering uses an overlap predicate:

- `AND (salary_max IS NULL OR salary_max >= ${salaryMin})` — posting with no upper bound matches any minimum
- `AND (salary_min IS NULL OR salary_min <= ${salaryMax})` — posting with no lower bound matches any maximum

**Rationale:**

- A posting with `salary_max = NULL` is interpreted as "open-ended / no upper bound". Excluding it
  from `salaryMin=50000` searches would hide legitimate high-paying postings that simply didn't
  declare an upper bound.
- A posting with `salary_min = NULL` and `salary_max = 80000` still represents work in the 0–80k
  range; it should match a `salaryMax=100000` filter.
- This matches SaaS job board convention (LinkedIn, Indeed use overlap semantics).

**Alternative considered:** Require explicit salary range on postings for filter eligibility. Rejected
because many legitimate postings omit salary_min or salary_max. Hiding them harms seeker experience
more than the occasional edge case from NULL-inclusive semantics.

**Note:** `salaryRange` facet buckets use `salary_min` as the primary bucketing field (with fallback
to `salary_max` when `salary_min IS NULL`). `salaryCompetitiveOnly = true` postings fall into the
`"competitive"` bucket regardless of numeric salary fields.

---

## Decision 5: `remote` filter maps to location regex OR diasporaFriendly

**Decision:** `filters.remote = true` maps to:

```sql
AND (location ~* 'remote' OR (cultural_context_json->>'diasporaFriendly')::boolean = true)
```

**Rationale:**

- The schema has no dedicated `is_remote` boolean column at this point in the portal roadmap.
- `location ~* 'remote'` catches postings that include "remote" in the location string (e.g.,
  "Remote", "Remote / Lagos", "Fully Remote").
- `diasporaFriendly = true` catches postings explicitly marked as diaspora-friendly, which in the
  Igbo community context strongly implies remote-compatible work arrangements (diaspora members
  are geographically distributed).
- This approximation is documented as a stop-gap.

**MANDATORY TODO:** `// TODO(schema): add is_remote boolean column — this regex+JSONB approximation is a stop-gap. See docs/decisions/search-cache-strategy.md §Decision 5.` is placed directly above the remote branch in `buildFilterPredicate` in `portal-job-search.ts`. When the `is_remote` column is added (migration TBD), update the predicate and remove the TODO.

**Known limitation:** A posting located in "Lagos, Nigeria" with `diasporaFriendly = true` will
appear in remote searches even if it genuinely requires on-site presence. This is an acceptable
trade-off: the community semantics of "diaspora-friendly" overlap heavily with remote-compatible.
Employers who are strictly on-site should NOT set `diasporaFriendly = true`.

---

## Decision 6: `COUNT(*) totalCount` — revisit trigger documented

**Decision:** `getJobSearchTotalCount` runs a single `SELECT COUNT(*)` against the full WHERE clause.
No estimated count or materialized rollup at this time.

**Rationale:** At current scale (< 10K active postings), `COUNT(*)` on a well-indexed table is fast
(< 10 ms P50 on CI hardware). The WHERE clause uses the GIN index for FTS and B-tree indexes for
status/archivedAt, making the count cheap.

**Numeric revisit trigger (NOT a hand-wave):** Revisit if EITHER:

1. Active postings exceed **10,000 rows**, OR
2. `getJobSearchTotalCount` query exceeds **100 ms P50** in harness measurements.

When a threshold is crossed, open a ticket to evaluate:

- `pg_class.reltuples` estimated count (fast, inaccurate for filtered queries)
- Materialized rollup table (accurate, requires maintenance trigger)
- Skip totalCount for paginated results past page 1 (only compute on first page)

No rewrite before a threshold is crossed.

---

## Decision 7: Rate limiting deferred

**Decision:** `GET /api/v1/jobs/search` has no rate limiting in P-4.1A.

**Rationale:** Rate limiting is a cross-cutting concern that applies to all portal API endpoints.
A dedicated cross-cutting story will add rate-limiting middleware to `withApiHandler`. The search
endpoint is public (no auth required), which makes rate-limiting important for DoS prevention —
but implementing it per-endpoint is the wrong abstraction.

**TODO anchor:** A `// TODO: Rate limiting — cross-cutting story will add middleware here.` comment
is placed in the route handler at the point where rate-limiting would be invoked.

**Interim protection:** The Redis cache provides implicit rate-limiting by making repeat identical
queries free (no DB hit). A truly novel query set still reaches the DB, but each query hits indexes
efficiently. This is acceptable until the cross-cutting middleware lands.

---

## Decision 8: Two-layer performance assertion (CI tolerant bounds + harness NFR budget)

**Decision:** Integration tests assert CI-tolerant regression guards. Production P95 budgets are
asserted separately in the loadtest harness (Story 12.6 infrastructure).

**CI integration test bounds (VS-5):**

- `expect(warmDuration).toBeLessThan(600)` — warm regression guard (not the production target)
- `expect(coldDuration).toBeLessThan(2000)` — cold regression guard (not the production target)

**Production P95 NFR (loadtest harness, NOT CI):**

- Warm (cache hit): P95 < 300 ms
- Cold (cache miss): P95 < 800 ms
- Measured against a pinned harness box with ≥ 1,000 active seeded postings

**Rationale:**

- Asserting 300/800 ms in CI integration tests would cause intermittent failures because:
  - CI postgres containers run on shared infrastructure with variable CPU allocation
  - Test isolation (small dataset) means the planner may use different plans than production
  - Cold start latencies for the Node.js VM, postgres client, and Redis connection inflate
    first-query timings significantly
- The CI bounds (600 ms warm, 2000 ms cold) are regression guards — they catch regressions like
  "cache write is silently broken" or "a 10× query slowdown was introduced", while tolerating
  infrastructure variability.
- The production NFR bounds live in the k6 loadtest script (Story 12.6) against a provisioned,
  warmed-up harness. This is the appropriate measurement environment.
- This separation follows the principle of "test correctness in CI, test performance in harness".

---

## References

- [PREP-F decisions](./full-text-search-spike.md) — FTS infrastructure, bilingual strategy, trigger design
- [PREP-G decisions](./cursor-pagination.md) — Cursor pagination types, seek predicates, sort indexes
- [P-4.1A story](../../_bmad-output/implementation-artifacts/p-4-1a-full-text-search-backend-api-contract.md)
- `apps/portal/src/services/job-search-service.ts` — Cache-aside implementation
- `packages/db/src/queries/portal-job-search.ts` — `buildFilterPredicate`, `getJobSearchFacets`
