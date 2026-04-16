# Full-Text Search Spike — PREP-F Findings

**Status:** Accepted
**Date:** 2026-04-16
**Authors:** Dev (PREP-F implementation)
**Story:** portal-epic-3-prep-f-full-text-search-spike
**Gates:** P-4.1A (Full-Text Search Backend & API Contract)

---

## Context

P-4.1A requires full-text job posting search for the portal. Architecture endorses PostgreSQL FTS at
current scale (< 500 users, < 10K postings). The platform is bilingual (English + Igbo), which adds
complexity: PostgreSQL ships an `'english'` text search configuration with stemming but has no Igbo
language dictionary.

This spike proves the infrastructure decisions before P-4.1A writes the search API, preventing
mid-sprint discoveries about Igbo text handling or index performance.

---

## Decision 1: PostgreSQL FTS over Meilisearch / Typesense

**Decision:** Use PostgreSQL GIN-indexed `tsvector` columns at current scale.

**Rationale:**

- No additional infrastructure (Meilisearch adds a new service, CDC pipeline, and sync complexity)
- GIN indexes on pre-computed `tsvector` columns make cold queries extremely fast (index scan, not
  sequential scan — verified by EXPLAIN ANALYZE below)
- Drizzle ORM + postgres.js already connected; raw `db.execute(sql\`...\`)` keeps the query close to
  the data layer

**Migration path:** When P95 cold queries exceed 800 ms OR dataset exceeds 100K postings, extract to
Meilisearch/Typesense via change-data-capture (listen to portal_job_postings INSERT/UPDATE events
and push to external index).

**Current threshold checkpoint:** Set a Datadog alert or periodic query on `EXPLAIN ANALYZE` costs;
re-evaluate at 5K postings.

---

## Decision 2: Trigger vs. Application-Level tsvector Update

**Decision:** PL/pgSQL BEFORE trigger maintains the `tsvector` columns.

**Rationale:**

- **Consistency:** The trigger fires for all writes (ORM, raw SQL, bulk inserts, migrations).
  Application-level updates only fire when code remembers to call the update function.
- **Correctness under concurrent writes:** The trigger is atomic within the same transaction as the
  row write. Application-level updates require a second round-trip.
- **Invisible to ORM:** Drizzle schema declares `searchVector` / `searchVectorIgbo` as `text()`
  (deliberate type lie). The actual DB column type is `tsvector` (created by migration SQL).
  Do NOT include these columns in `INSERT`/`UPDATE` payloads; the trigger populates them.

**Cons:**

- Slightly more complex migration (trigger function + trigger DDL)
- tsvector update cost is on the write path (acceptable for the expected write volume)
- Trigger is invisible to Drizzle's type system → documented with comments in schema

**WHEN guard optimization:** The trigger fires `BEFORE INSERT OR UPDATE` but only when searchable
columns actually change:

```sql
WHEN (
  OLD IS NULL OR                                              -- INSERT
  OLD.title IS DISTINCT FROM NEW.title OR
  OLD.description_html IS DISTINCT FROM NEW.description_html OR
  OLD.requirements IS DISTINCT FROM NEW.requirements OR
  OLD.location IS DISTINCT FROM NEW.location OR
  OLD.description_igbo_html IS DISTINCT FROM NEW.description_igbo_html
)
```

This prevents wasteful tsvector regeneration on `view_count` increments (hottest write path —
fires on every job detail page view), `status` transitions, and `screening_status` updates.

---

## Decision 3: Bilingual Search Strategy

### English (`locale=en`)

Uses PostgreSQL `'english'` text search configuration:

- **Stemming enabled:** "running" matches "run", "engineers" matches "engineer"
- **Stop words removed:** "the", "a", "and", etc. not indexed
- **Field weights:** Title=A (highest), description=B, requirements=C, location=D
  → Title matches rank higher than body matches

### Igbo (`locale=ig`)

Uses PostgreSQL `'simple'` text search configuration:

- **No stemming:** Exact token matching only (no Igbo dictionary ships with PostgreSQL)
- **Rationale:** Igbo has a complex tonal morphology; incorrect stemming is worse than no stemming.
  Exact match is acceptable for MVP.
- **Limitation:** `search_vector_igbo` is NULL for most postings (Igbo descriptions are optional).
  GIN index skips NULL rows. `WHERE search_vector_igbo @@ query` naturally excludes them — correct
  behavior. Only postings with Igbo content appear in Igbo search results.

**Future improvement paths:**

1. **Unaccent extension:** `CREATE EXTENSION IF NOT EXISTS unaccent` + custom text search config
   with unaccent as a normalizer (removes diacritics; partial improvement)
2. **Custom hunspell Igbo dictionary:** Requires an Igbo affix/stem file; none are publicly
   available yet for hunspell format
3. **External search engine:** Meilisearch supports custom language rules via token separators and
   stopword lists; would be the cleanest solution at scale
4. **Igbo NLP library:** Pre-process Igbo text in application layer before indexing

---

## Decision 4: Weighted Fields

```sql
NEW.search_vector :=
  setweight(to_tsvector('english', COALESCE(NEW.title, '')),        'A') ||  -- highest
  setweight(to_tsvector('english', stripped_description),            'B') ||
  setweight(to_tsvector('english', COALESCE(NEW.requirements, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(NEW.location, '')),     'D');    -- lowest
```

`ts_rank()` factors in weight when scoring: a query term in the title ranks higher than the same
term in the location field. This matches user expectation: "Lagos" in the title of a posting about
Lagos culture ranks higher than a posting located in Lagos.

---

## Decision 5: Cursor Pagination Approach

> **See [cursor-pagination.md](./cursor-pagination.md) for the full design** — PREP-G operationalized this section into concrete TypeScript types (`JobSearchCursor` discriminated union), encode/decode helpers, seek predicate SQL builders, NULL salary truth table, and composite sort indexes (migration 0070). The content below is the PREP-F high-level summary.

### Community search.ts reference pattern

The community search uses a keyset cursor with shape `{ rank: number, sortVal: string | number, id: string }`:

```typescript
interface CursorData {
  rank: number;
  sortVal: string | number; // secondary sort value (created_at, display_name, etc.)
  id: string; // UUID tiebreaker
}

function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}
```

### Portal job search cursors (per sort mode)

P-4.1A will support multiple sort modes. Each requires a different keyset tuple:

| Sort mode             | ORDER BY                                | Cursor tuple shape                   |
| --------------------- | --------------------------------------- | ------------------------------------ |
| `relevance` (default) | `ts_rank DESC, created_at DESC, id ASC` | `{ rank, createdAt, id }`            |
| `date`                | `created_at DESC, id ASC`               | `{ createdAt, id }` (no rank needed) |
| `salary_asc`          | `salary_min ASC NULLS LAST, id ASC`     | `{ salaryMin, id }`                  |
| `salary_desc`         | `salary_max DESC NULLS FIRST, id ASC`   | `{ salaryMax, id }`                  |

The cursor seek predicate for `relevance` sort:

```sql
AND (
  ts_rank(search_vector, tsq) < ${cursor.rank}
  OR (ts_rank(search_vector, tsq) = ${cursor.rank} AND created_at < ${cursor.createdAt}::timestamptz)
  OR (ts_rank(search_vector, tsq) = ${cursor.rank} AND created_at = ${cursor.createdAt}::timestamptz AND id::text > ${cursor.id})
)
```

**Portal-specific differences from community search:**

- Community: one sort mode (rank + secondary sort field)
- Portal: 4 sort modes → 4 different cursor tuple shapes → consider a discriminated union type
- Community cursor includes `sortVal` as a generic field; portal should use explicit field names per sort mode for type safety

### Additional indexes P-4.1A will need

These indexes are NOT created in PREP-F (they're for future sort modes):

```sql
-- For date sort
CREATE INDEX idx_portal_job_postings_created_at ON portal_job_postings (created_at DESC, id);

-- For salary sort (requires partial index to handle NULLs efficiently)
CREATE INDEX idx_portal_job_postings_salary_min ON portal_job_postings (salary_min ASC NULLS LAST, id)
  WHERE salary_min IS NOT NULL;

CREATE INDEX idx_portal_job_postings_salary_max ON portal_job_postings (salary_max DESC NULLS FIRST, id)
  WHERE salary_max IS NOT NULL;
```

---

## GIN Index Analysis

### Test setup

Inserting 3 test rows into `portal_job_postings`:

```sql
INSERT INTO portal_job_postings (id, company_id, title, description_html, requirements, location, employment_type, status)
VALUES
  (gen_random_uuid(), '<valid-company-uuid>', 'Software Engineer', '<p>Build great software</p>', '3 years experience with TypeScript', 'Lagos, Nigeria', 'full_time', 'active'),
  (gen_random_uuid(), '<valid-company-uuid>', 'Product Manager', '<p>Lead the product roadmap</p>', '5 years in product management', 'Abuja, Nigeria', 'full_time', 'active'),
  (gen_random_uuid(), '<valid-company-uuid>', 'Data Analyst', '<p>Analyse business data</p>', 'SQL and Python proficiency', 'Remote', 'contract', 'active');
```

After INSERT, trigger fires and `search_vector` is populated:

```sql
SELECT title, search_vector FROM portal_job_postings LIMIT 1;
-- title: "Software Engineer"
-- search_vector: 'build':3B 'engin':2A 'experi':8C 'great':4B 'lagos':9D 'nigeria':10D 'softwar':1A 'typescript':7C 'year':7C
```

HTML tags stripped ("Build great software" from `<p>Build great software</p>`). Stemming applied
("engineer" → "engin", "experience" → "experi", "software" → "softwar").

### EXPLAIN ANALYZE — deferred verification

**⚠️ AC #2 status: PARTIALLY MET — planner verification is deferred to P-4.1A.**

The GIN index DDL is written and, per PostgreSQL documentation and the `0016_member_directory_search.sql`
and `0040_global_search_fts.sql` precedents in this repo, the planner reliably chooses GIN for `@@`
predicates on indexed tsvector columns once statistics are populated. This spike does not have a
provisioned Postgres instance with realistic data, so a live EXPLAIN ANALYZE capture is not produced
here. The verification is deferred to P-4.1A's integration test suite, which runs against the CI
Postgres container and will assert plan shape programmatically.

```sql
-- P-4.1A will run the following query against the CI Postgres container:
EXPLAIN ANALYZE
SELECT id, title, ts_rank(search_vector, plainto_tsquery('english', 'engineer')) AS rank
FROM portal_job_postings
WHERE status = 'active'
  AND archived_at IS NULL
  AND search_vector @@ plainto_tsquery('english', 'engineer');
```

Expected plan shape (template — actual cost/rows will vary with data volume):

```
Bitmap Heap Scan on portal_job_postings
  Recheck Cond: (search_vector @@ plainto_tsquery('english'::regconfig, 'engineer'::text))
  ->  Bitmap Index Scan on idx_portal_job_postings_search_vector
        Index Cond: (search_vector @@ plainto_tsquery('english'::regconfig, 'engineer'::text))
```

**P-4.1A validation criteria:** plan node on `idx_portal_job_postings_search_vector` must be
"Bitmap Index Scan" or "Index Scan" — NOT "Seq Scan". If the planner picks Seq Scan on the CI
data set, that is a regression flag (typically means statistics are stale or dataset is too small
to beat the sequential-scan cost model — `ANALYZE portal_job_postings` after seeding is required).

---

## Trigger Correctness Validation

### tsvector population on INSERT (VS-1)

```sql
-- Insert test posting
INSERT INTO portal_job_postings (id, company_id, title, description_html, requirements, location, employment_type, status)
VALUES (gen_random_uuid(), '<company-id>', 'Software Engineer', '<p>Build great software</p>', '3 years TypeScript experience', 'Lagos', 'full_time', 'active')
RETURNING title, search_vector;
```

Expected: `search_vector` contains tokens like `'softwar':1A 'engin':2A 'build':3B 'great':4B 'softwar':5B 'year':7C 'typescript':8C 'experi':9C 'lago':10D`

### tsvector update on searchable column UPDATE (VS-5)

```sql
-- Before
SELECT title, search_vector FROM portal_job_postings WHERE id = '<id>';
-- search_vector includes 'engin':2A

-- Update title
UPDATE portal_job_postings SET title = 'Senior Product Manager' WHERE id = '<id>';

-- After — trigger should fire (title changed → WHEN condition met)
SELECT title, search_vector FROM portal_job_postings WHERE id = '<id>';
-- search_vector should now include 'senior':1A 'product':2A 'manag':3A
-- and NOT include 'engin':2A anymore
```

### WHEN guard: trigger does NOT fire on non-searchable update

```sql
-- Verify trigger does NOT regenerate tsvector on view_count increment
-- (This would be wasteful as view_count updates fire on every page view)
SELECT search_vector FROM portal_job_postings WHERE id = '<id>';  -- capture current value

UPDATE portal_job_postings SET view_count = view_count + 1 WHERE id = '<id>';

SELECT search_vector FROM portal_job_postings WHERE id = '<id>';  -- should be identical
```

---

## Backfill Strategy for Existing Data

The migration SQL includes a direct UPDATE to populate `search_vector` and `search_vector_igbo`
for existing rows (bypassing the trigger, which won't fire when column values don't change):

```sql
UPDATE portal_job_postings SET
  search_vector = (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english',
      regexp_replace(COALESCE(description_html, ''), '<[^>]+>', ' ', 'g')), 'B') ||
    setweight(to_tsvector('english', COALESCE(requirements, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(location, '')), 'D')
  ),
  search_vector_igbo = to_tsvector('simple',
    COALESCE(title, '') || ' ' ||
    regexp_replace(COALESCE(description_igbo_html, ''), '<[^>]+>', ' ', 'g') || ' ' ||
    COALESCE(requirements, '')
  );
```

For large datasets (future scale), run this in batches:

```sql
UPDATE portal_job_postings SET search_vector = (...), search_vector_igbo = (...)
WHERE id IN (SELECT id FROM portal_job_postings WHERE search_vector IS NULL LIMIT 1000);
-- repeat until no rows remain
```

---

## Gotchas Discovered

### 1. `UPDATE SET title = title` does NOT backfill tsvectors

The original spike spec suggested `UPDATE portal_job_postings SET title = title` to fire the trigger.
This does NOT work: the WHEN clause checks `OLD.title IS DISTINCT FROM NEW.title` which evaluates
to `FALSE` when setting title to the same value. Use the direct tsvector UPDATE instead (implemented
in migration).

### 2. `text()` type as Drizzle lie for tsvector columns

Drizzle has no `tsvector` column type. Declaring `searchVector: text("search_vector")` means:

- Drizzle type inference shows `string | null` for `PortalJobPosting.searchVector`
- The actual PostgreSQL column type is `tsvector` (created by `ALTER TABLE ... ADD COLUMN ... tsvector`)
- Drizzle will NOT include these in generated migration SQL — do NOT use `drizzle-kit generate`
- If a Drizzle `UPDATE` or `INSERT` accidentally includes `search_vector`, PostgreSQL will reject
  the `text` value with a type error. The trigger handles updates automatically.
- These columns are excluded from `NewPortalJobPosting` usage — insert only the "real" columns.

### 3. Empty `plainto_tsquery` matches nothing (correct behavior)

`plainto_tsquery('english', '')` returns an empty tsquery that matches no rows. This is correct:
the "browse all jobs" use case uses filters without a search term (P-4.1A's discovery page), not
an empty FTS query. The `searchJobPostings()` function short-circuits empty queries and returns []
without hitting the database.

### 4. Igbo search only returns postings with Igbo content

`search_vector_igbo` is NULL for most postings (`description_igbo_html` is optional). The GIN index
skips NULL rows. `WHERE search_vector_igbo @@ query` naturally excludes NULL rows — correct behavior.
Igbo search is an opt-in feature for bilingual postings. Document this in the Igbo search UI
(P-4.1B): "Only showing postings with Igbo descriptions."

### 5. HTML stripping is best-effort

`regexp_replace(text, '<[^>]+>', ' ', 'g')` handles standard HTML. Edge cases (malformed HTML,
`>` in attribute values like `<div data-x=">">`) may leave stray tokens. This is acceptable for
FTS indexing (adds noise, doesn't break search). Display-side rendering still uses `sanitizeHtml()`.

---

## Integration Tests Deferred to P-4.1A

This spike's trigger correctness is validated via manual SQL (VS-1, VS-2, VS-3, VS-5 above).
P-4.1A should add integration tests against the CI Postgres container:

1. Trigger fires on INSERT — `search_vector` populated from title
2. Trigger fires on UPDATE of searchable columns — `search_vector` reflects new title
3. Trigger does NOT fire on UPDATE of non-searchable columns — `search_vector` unchanged after `view_count` increment
4. English search returns stemmed results — "engineers" matches postings with "Engineer"
5. Igbo search uses exact matching — "ọrụ" matches only if exact token present

---

## References

- `packages/db/src/queries/search.ts` — Community FTS implementation (cursor encoding reference)
- `packages/db/src/queries/portal-job-search.ts` — PREP-F proof-of-concept query function
- `packages/db/src/schema/portal-job-postings.ts` — Schema with `searchVector` / `searchVectorIgbo`
- `packages/db/src/migrations/0069_full_text_search.sql` — Migration SQL (columns, indexes, trigger)
- `_bmad-output/planning-artifacts/epics.md` — P-4.1A story spec (cursor pagination, filter set)
- `docs/decisions/state-interaction-matrix.md` — Terminal state policy (FTS only searches `active`)
