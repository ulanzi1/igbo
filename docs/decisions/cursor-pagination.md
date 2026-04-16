# Decision: Cursor Pagination for Portal Job Search

**Status:** Accepted
**Date:** 2026-04-16
**Story:** PREP-G (Cursor Pagination PoC — Opaque Cursor Encoding + Sort Stability)
**Blocks:** P-4.1A (Full-Text Search Backend & API Contract)
**See also:** [full-text-search-spike.md §5](./full-text-search-spike.md#decision-5-cursor-pagination-approach) (high-level cursor shapes per sort mode, documented in PREP-F)

---

## Context

P-4.1A must implement a paginated `GET /api/v1/jobs/search` endpoint supporting four sort modes: `relevance`, `date`, `salary_asc`, `salary_desc`. Offset-based pagination (`LIMIT n OFFSET k`) fails under concurrent inserts — row at position k+1 shifts when a new row is inserted before it, causing either page-boundary duplicates or skipped rows. Keyset (seek) pagination avoids this by encoding the sort-key values of the last returned row into an opaque cursor, which becomes a `WHERE` clause predicate on the next request.

This spike formalizes the cursor contract, implements and tests the helpers, and creates the composite sort indexes. It delivers everything P-4.1A needs to implement the API route without debating cursor shape mid-sprint.

---

## Decision 1: Opaque vs. Signed (No HMAC)

**Decision:** Cursors are not HMAC-signed.

**Rationale:** Cursor tampering is not a meaningful security threat for public job search:

1. The cursor only affects **which rows come back** (result set contents). The `WHERE status = 'active' AND archived_at IS NULL` filters always apply — no row can leak through a tampered cursor.
2. Tampered cursors either decode to a nonsense seek point (result: some rows skipped or re-visited, indistinguishable from "user pasted an old cursor") or fail schema validation and are treated as `null`, falling back to page 1 (graceful degradation, never data corruption).
3. Signing adds complexity: HMAC secret management, key rotation, cursor expiry — without meaningful security benefit at the current scale.

This is the same reasoning used in community `search.ts` (lines 74–98).

**Forward-compat design:** If a signing requirement emerges later, the `v` (version) field enables a clean migration — a `v: 2` cursor could carry an HMAC; old `v: 1` decoders seeing `v: 2` return `null` (fall back to page 1) instead of throwing.

---

## Decision 2: base64url over base64

**Decision:** Cursors use `base64url` encoding (`Buffer.from(json).toString("base64url")`).

**Rationale:** Standard base64 uses `+`, `/`, and `=` characters that require URL percent-encoding in `?cursor=` query parameters (e.g., `%2B`, `%2F`, `%3D`). base64url substitutes `-` for `+` and `_` for `/`, and omits padding — safe in URL query strings without escaping. Node 16+ natively supports `Buffer.from(str, "base64url")` / `.toString("base64url")`.

---

## Decision 3: Discriminated Union over Generic `sortVal`

**Decision:** `JobSearchCursor` is a discriminated union keyed on `s: JobSearchSort`, with explicitly-named sort-key fields per variant.

**Rationale:** The community `search.ts` cursor uses a generic `sortVal: string | number` field. For a single sort mode this is acceptable, but portal has four modes with different nullable semantics (`salaryMin: number | null` vs. `createdAt: string` vs. `rank: number`). A generic bag loses type safety and makes the NULL salary handling ambiguous.

The discriminated union:

```typescript
type JobSearchCursor =
  | { v: 1; s: "relevance"; rank: number; createdAt: string; id: string }
  | { v: 1; s: "date"; createdAt: string; id: string }
  | { v: 1; s: "salary_asc"; salaryMin: number | null; id: string }
  | { v: 1; s: "salary_desc"; salaryMax: number | null; id: string };
```

- TypeScript exhaustiveness checks on `switch (sort)` branches catch future sort modes at compile time
- `null` salary fields are explicit in the type, not stringly-typed or implicit
- `decodeJobSearchCursor` validates per-variant required fields, rejecting schema-mismatched payloads

---

## Decision 4: Explicit NULL Handling in Seek Predicates

**Decision:** NULL salary handling is encoded explicitly in the seek predicate, not relying on PostgreSQL default NULL ordering behaviour at the predicate level.

**Rationale:** `ORDER BY salary_min ASC NULLS LAST` sends NULLs to the end of the result set. The seek predicate must replicate this logic for rows after a cursor. Three states exist:

### NULL salary truth table

#### salary_asc (NULLS LAST)

| Cursor salaryMin  | Predicate                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| number (non-null) | `(salary_min IS NOT NULL AND salary_min > c.salaryMin) OR (salary_min IS NOT NULL AND salary_min = c.salaryMin AND id > c.id) OR (salary_min IS NULL)` — non-null head, NULLs always come after |
| null              | `salary_min IS NULL AND id::text > c.id` — cursor is in the NULL tail; only NULL-salary rows remain                                                                                             |

#### salary_desc (NULLS FIRST)

| Cursor salaryMax  | Predicate                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| null              | `salary_max IS NULL AND id::text > c.id` — cursor is in the NULL head (NULLs sort first in DESC NULLS FIRST); only NULL rows with higher id remain  |
| number (non-null) | `salary_max IS NOT NULL AND (salary_max < c.salaryMax OR (salary_max = c.salaryMax AND id > c.id))` — past the NULL head, only non-null rows remain |

The `ORDER BY` clause still explicitly states `NULLS LAST` / `NULLS FIRST` for clarity and correctness.

---

## Decision 5: Fetch-One-Extra for `hasMore`

**Decision:** Use `LIMIT safeLimit + 1` and slice to `safeLimit` to determine `hasMore` without a second `COUNT(*)` query.

**Rationale:** A `COUNT(*)` query on a large table requires a full sequential scan even with partial indexes (PostgreSQL cannot satisfy COUNT with index-only scans on filtered rows in all cases). For the PoC and initial production use, the one-extra trick is well-established, adds no latency, and avoids double the DB round-trips.

```typescript
const rows = await db.execute(sql`... LIMIT ${safeLimit + 1}`);
const hasMore = rows.length > safeLimit;
const items = rows.slice(0, safeLimit);
const nextCursor =
  hasMore && items.at(-1) ? encodeJobSearchCursor(buildCursorFromRow(items.at(-1)!, sort)) : null;
```

P-4.1A may optionally add an approximate `totalCount` via a separate query, but that is explicitly out of scope for this spike.

---

## Sort-Stability Contract

**"Stable pagination"** is defined as: between two page fetches at T1 and T2 with no inserts/updates, the same rows appear in the same order at the same positions; with inserts at T1.5, newly inserted rows may appear on a _future_ page or a _past_ page depending on their sort position, but an already-fetched page is never re-fetched, and no row is skipped.

This is contrasted with offset-based pagination which fails under concurrent inserts: a row inserted between pages shifts all subsequent rows by one position, causing page-boundary duplicates and/or skips.

### Known caveat: `relevance` sort under concurrent tsvector updates

If a posting's `description_html` changes between page 1 and page 2 (triggering the `tsvector_update_trigger`), its `ts_rank` score changes. If the new rank crosses the cursor boundary, the row may appear on a different page or be skipped on the current traversal. This is acceptable for FTS — users expect search results to reflect the latest content. It is documented as a known caveat, not a defect.

---

## Migration Coordination

**Option A (chosen — bundled with PREP-G):** Migration `0070_portal_job_postings_sort_indexes.sql` is created in this spike, with journal entry idx 70 (`0070_portal_job_postings_sort_indexes`).

Three composite indexes are created:

```sql
-- Date sort: supports "date" cursor mode seek predicate
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_created_at
  ON portal_job_postings (created_at DESC, id);

-- Salary ascending: supports "salary_asc" seek predicate
-- Partial index: NULLs not indexed (clustered in NULLS LAST tail, sequential scan acceptable)
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_salary_min
  ON portal_job_postings (salary_min ASC, id)
  WHERE salary_min IS NOT NULL;

-- Salary descending: supports "salary_desc" seek predicate
CREATE INDEX IF NOT EXISTS idx_portal_job_postings_salary_max
  ON portal_job_postings (salary_max DESC, id)
  WHERE salary_max IS NOT NULL;
```

**Why partial indexes for salary columns:** postings with `NULL` salary values cluster together at the end/beginning of their respective sort orders. Including NULLs in the B-tree index would add index size without improving seek predicate performance for non-null rows. When the cursor is in the NULL cluster, the seek predicate `salary_min IS NULL AND id::text > c.id` performs a sequential scan of the NULL cluster — acceptable because the cluster is small relative to total postings.

**Expected EXPLAIN ANALYZE plan shapes** (to be verified in P-4.1A's integration suite against CI Postgres):

```sql
-- date sort with cursor:
EXPLAIN ANALYZE
SELECT id, created_at FROM portal_job_postings
WHERE status = 'active' AND archived_at IS NULL
  AND (created_at < '2026-04-16T14:22:11.543Z'::timestamptz
    OR (created_at = '2026-04-16T14:22:11.543Z'::timestamptz AND id::text > 'abc-123'))
ORDER BY created_at DESC, id ASC
LIMIT 21;
-- Expected: Bitmap Index Scan on idx_portal_job_postings_created_at

-- salary_asc sort with non-null cursor:
EXPLAIN ANALYZE
SELECT id, salary_min FROM portal_job_postings
WHERE status = 'active' AND archived_at IS NULL
  AND ((salary_min IS NOT NULL AND salary_min > 80000)
    OR (salary_min IS NOT NULL AND salary_min = 80000 AND id::text > 'abc-123')
    OR salary_min IS NULL)
ORDER BY salary_min ASC NULLS LAST, id ASC
LIMIT 21;
-- Expected: Bitmap Index Scan on idx_portal_job_postings_salary_min (for non-null head)
-- + sequential scan for NULL tail rows (if any)
```

---

## P-4.1A Handoff Checklist

### What PREP-G delivers (ready for P-4.1A to consume)

- [x] `JobSearchSort` type exported from `@igbo/db` (`portalJobSearchQueries.JobSearchSort`)
- [x] `JobSearchCursor` discriminated union exported from `@igbo/db`
- [x] `encodeJobSearchCursor(cursor)` — pure function, synchronous
- [x] `decodeJobSearchCursor(raw)` — fail-safe (returns `null` on any invalid input)
- [x] `searchJobPostings({ query, locale, sort?, cursor? })` → `Promise<{ items, nextCursor }>`
- [x] Seek predicates for all 4 sort modes (tested via `queryChunks` flatten)
- [x] NULL salary handling in both asc (NULLS LAST) and desc (NULLS FIRST) directions
- [x] Composite sort indexes (migration 0070, idx 70)
- [x] 36 passing tests: encode/decode round-trips, fail-safe decode, SQL structure per sort, NULL branches, hasMore logic, cursor tampering

### What P-4.1A must still build

- [ ] `GET /api/v1/jobs/search` API route (authentication, validation, caching)
- [ ] Redis caching layer with `?q=` + `?sort=` + `?cursor=` cache key strategy
- [ ] Facet aggregation: `location`, `employmentType`, `industry` counts per search result set
- [ ] `totalCount` (approximate via `COUNT(*)` or omitted — P-4.1A decides)
- [ ] Integration tests against CI Postgres container (verify index scans with EXPLAIN ANALYZE)
- [ ] Client-side cursor state management (`?cursor=` in URL, "Load More" button) — P-4.1B

---

## Implementation Gotchas

1. **`ts_rank` in WHERE vs. SELECT:** `ts_rank()` is re-computed in the seek predicate — PostgreSQL does not expose SELECT aliases in WHERE. For the PoC, double-computation is acceptable (GIN index drives the primary filter). If performance becomes a concern, wrap in a CTE/subquery to compute rank once.

2. **`id::text` cast in seek predicate:** UUIDs must be cast to text for lexicographic comparison (`id::text > c.id`). Without the cast, PostgreSQL compares UUIDs as bytes which is correct, but the string representation in the cursor would need to match exactly. The cast makes intent explicit and avoids type-mismatch errors if the cursor carries a text `id`.

3. **`NULLS LAST` / `NULLS FIRST` in ORDER BY:** Always state NULL ordering explicitly in the SQL even though PostgreSQL defaults align (ASC defaults NULLS LAST; DESC defaults NULLS FIRST). Explicit is safer across PostgreSQL version upgrades.

4. **`flattenSql` test helper picks up SELECT ts_rank:** The test helper flattens the entire SQL object, so `ts_rank` appears in the flattened output for ALL sort modes (it's in the SELECT clause). Assertions like `not.toContain("ts_rank")` are too broad — assert `not.toContain("ts_rank")` only on the ORDER BY fragment if needed, or verify the ORDER BY string directly.

5. **`it.each` with `as const` satisfies:** Use `satisfies JobSearchCursor[]` on the `it.each` payload array to get TypeScript type checking on each cursor variant without losing the literal types needed by the discriminated union.

6. **`Buffer.from(raw, "base64url").toString("utf-8")` on invalid base64url:** Node does not throw on malformed base64url — it silently returns garbage UTF-8. The `JSON.parse()` call on the decoded string will then throw (caught by the surrounding `try/catch`). This is the expected fail-safe path.
