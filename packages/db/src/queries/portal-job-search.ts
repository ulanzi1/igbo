// TODO(P-4.1-TECHDEBT-1): collapse dual search paths post-P-4.1B once the UI has
// shipped against the production path (searchJobPostingsWithFilters) and the PoC
// signature (searchJobPostings) can be safely retired.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../index";

// ---------------------------------------------------------------------------
// Cursor types — discriminated union keyed on `s` (sort mode)
// ---------------------------------------------------------------------------

export type JobSearchSort = "relevance" | "date" | "salary_asc" | "salary_desc";

export type JobSearchCursor =
  | { v: 1; s: "relevance"; rank: number; createdAt: string; id: string }
  | { v: 1; s: "date"; createdAt: string; id: string }
  | { v: 1; s: "salary_asc"; salaryMin: number | null; id: string }
  | { v: 1; s: "salary_desc"; salaryMax: number | null; id: string };

// ---------------------------------------------------------------------------
// Encode / decode helpers
//
// Cursors are base64url(JSON.stringify(payload)). "Opaque ≠ signed" — we do
// NOT HMAC the cursor because tampering produces at worst a nonsense seek
// point (some rows skipped or a duplicate re-visited) which is
// indistinguishable from "user pasted an old cursor". The WHERE filters
// (status = 'active', archived_at IS NULL) still apply — no row can leak
// through a tampered cursor. This matches the threat model in community
// search.ts. See docs/decisions/cursor-pagination.md §Decision 1.
//
// base64url over base64: avoids +/=/  characters that need URL-escaping in
// ?cursor= query params. Node 16+ Buffer.from(raw, "base64url") is built-in.
// ---------------------------------------------------------------------------

export function encodeJobSearchCursor(cursor: JobSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeJobSearchCursor(raw: string): JobSearchCursor | null {
  if (!raw || !raw.trim()) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const c = parsed as Record<string, unknown>;
    if (c["v"] !== 1) return null; // unknown version → fall back to page 1
    switch (c["s"]) {
      case "relevance":
        if (
          typeof c["rank"] !== "number" ||
          typeof c["createdAt"] !== "string" ||
          typeof c["id"] !== "string"
        )
          return null;
        return {
          v: 1,
          s: "relevance",
          rank: c["rank"],
          createdAt: c["createdAt"],
          id: c["id"],
        };
      case "date":
        if (typeof c["createdAt"] !== "string" || typeof c["id"] !== "string") return null;
        return { v: 1, s: "date", createdAt: c["createdAt"], id: c["id"] };
      case "salary_asc":
        if (
          (c["salaryMin"] !== null && typeof c["salaryMin"] !== "number") ||
          typeof c["id"] !== "string"
        )
          return null;
        return {
          v: 1,
          s: "salary_asc",
          salaryMin: c["salaryMin"] as number | null,
          id: c["id"],
        };
      case "salary_desc":
        if (
          (c["salaryMax"] !== null && typeof c["salaryMax"] !== "number") ||
          typeof c["id"] !== "string"
        )
          return null;
        return {
          v: 1,
          s: "salary_desc",
          salaryMax: c["salaryMax"] as number | null,
          id: c["id"],
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query interfaces
// ---------------------------------------------------------------------------

export interface JobSearchParams {
  query: string;
  locale: "en" | "ig";
  limit?: number;
  sort?: JobSearchSort;
  cursor?: string;
}

export interface JobSearchResult {
  id: string;
  title: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  employment_type: string;
  created_at: string;
  relevance: string;
  snippet: string | null;
}

export interface JobSearchPage {
  items: JobSearchResult[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Internal SQL builders
// ---------------------------------------------------------------------------

function buildOrderBy(
  sort: JobSearchSort,
  tsQuery?: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  switch (sort) {
    case "relevance":
      // ts_rank is re-computed in ORDER BY — PostgreSQL does not expose SELECT
      // aliases in ORDER BY without a subquery. Double-compute is acceptable at
      // PoC scale (GIN index drives the primary filter, not rank computation).
      return sql`ORDER BY ts_rank(search_vector, ${tsQuery}) DESC, created_at DESC, id::text ASC`;
    case "date":
      return sql`ORDER BY created_at DESC, id::text ASC`;
    case "salary_asc":
      return sql`ORDER BY salary_min ASC NULLS LAST, id::text ASC`;
    case "salary_desc":
      return sql`ORDER BY salary_max DESC NULLS FIRST, id::text ASC`;
  }
}

function buildOrderByIgbo(
  sort: JobSearchSort,
  tsQuery?: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  // Same ORDER BY shapes but referencing search_vector_igbo for relevance sort.
  // date/salary sorts are identical between locales.
  if (sort === "relevance") {
    return sql`ORDER BY ts_rank(search_vector_igbo, ${tsQuery}) DESC, created_at DESC, id::text ASC`;
  }
  return buildOrderBy(sort);
}

/**
 * Build the cursor seek predicate (AND clause) for a given decoded cursor.
 * Returns an empty SQL fragment when cursor is null (first page).
 *
 * NULL salary handling — three-state truth table (docs/decisions/cursor-pagination.md §NULL table):
 *
 * salary_asc NULLS LAST:
 *   A) cursor.salaryMin is a number  → cursor is in the non-null head
 *      seek: rows with salary_min > cursor OR (=cursor AND id > cursor.id) OR salary_min IS NULL
 *   B) cursor.salaryMin is null      → cursor is in the NULL tail
 *      seek: salary_min IS NULL AND id::text > cursor.id
 *
 * salary_desc NULLS FIRST:
 *   A) cursor.salaryMax is null      → cursor is in the NULL head (NULLs sort first)
 *      seek: salary_max IS NULL AND id::text > cursor.id
 *   B) cursor.salaryMax is a number  → cursor is in the non-null body
 *      seek: salary_max IS NOT NULL AND (salary_max < cursor OR (=cursor AND id > cursor.id))
 */
function buildCursorPredicate(
  cursor: JobSearchCursor | null,
  sort: JobSearchSort,
  tsQuery?: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (!cursor || cursor.s !== sort) return sql``;

  switch (sort) {
    case "relevance": {
      const c = cursor as Extract<JobSearchCursor, { s: "relevance" }>;
      return sql`AND (
        ts_rank(search_vector, ${tsQuery}) < ${c.rank}
        OR (ts_rank(search_vector, ${tsQuery}) = ${c.rank} AND created_at < ${c.createdAt}::timestamptz)
        OR (ts_rank(search_vector, ${tsQuery}) = ${c.rank} AND created_at = ${c.createdAt}::timestamptz AND id::text > ${c.id})
      )`;
    }
    case "date": {
      const c = cursor as Extract<JobSearchCursor, { s: "date" }>;
      return sql`AND (
        created_at < ${c.createdAt}::timestamptz
        OR (created_at = ${c.createdAt}::timestamptz AND id::text > ${c.id})
      )`;
    }
    case "salary_asc": {
      const c = cursor as Extract<JobSearchCursor, { s: "salary_asc" }>;
      if (c.salaryMin === null) {
        // Case B: cursor is in the NULL tail — only NULL-salary rows remain
        return sql`AND salary_min IS NULL AND id::text > ${c.id}`;
      }
      // Case A: cursor is in the non-null head
      return sql`AND (
        (salary_min IS NOT NULL AND salary_min > ${c.salaryMin})
        OR (salary_min IS NOT NULL AND salary_min = ${c.salaryMin} AND id::text > ${c.id})
        OR (salary_min IS NULL)
      )`;
    }
    case "salary_desc": {
      const c = cursor as Extract<JobSearchCursor, { s: "salary_desc" }>;
      if (c.salaryMax === null) {
        // Case A: cursor is in the NULL head (NULLs sort first in DESC NULLS FIRST)
        return sql`AND salary_max IS NULL AND id::text > ${c.id}`;
      }
      // Case B: cursor is in the non-null body (past all NULLs)
      return sql`AND salary_max IS NOT NULL AND (
        salary_max < ${c.salaryMax}
        OR (salary_max = ${c.salaryMax} AND id::text > ${c.id})
      )`;
    }
  }
}

/**
 * Build the relevance-sort cursor predicate for Igbo locale.
 * Identical shape to English but references search_vector_igbo.
 */
function buildCursorPredicateIgbo(
  cursor: JobSearchCursor | null,
  sort: JobSearchSort,
  tsQuery?: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (!cursor || sort !== "relevance") {
    return buildCursorPredicate(cursor, sort, tsQuery);
  }
  if (cursor.s !== sort) return sql``;
  const c = cursor as Extract<JobSearchCursor, { s: "relevance" }>;
  return sql`AND (
    ts_rank(search_vector_igbo, ${tsQuery}) < ${c.rank}
    OR (ts_rank(search_vector_igbo, ${tsQuery}) = ${c.rank} AND created_at < ${c.createdAt}::timestamptz)
    OR (ts_rank(search_vector_igbo, ${tsQuery}) = ${c.rank} AND created_at = ${c.createdAt}::timestamptz AND id::text > ${c.id})
  )`;
}

function buildCursorFromRow(row: JobSearchResult, sort: JobSearchSort): JobSearchCursor {
  switch (sort) {
    case "relevance":
      return {
        v: 1,
        s: "relevance",
        rank: parseFloat(row.relevance),
        createdAt: row.created_at,
        id: row.id,
      };
    case "date":
      return { v: 1, s: "date", createdAt: row.created_at, id: row.id };
    case "salary_asc":
      return { v: 1, s: "salary_asc", salaryMin: row.salary_min, id: row.id };
    case "salary_desc":
      return {
        v: 1,
        s: "salary_desc",
        salaryMax: row.salary_max,
        id: row.id,
      };
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TS_HEADLINE_OPTIONS =
  "StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=30, MinWords=15";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

/**
 * Cursor-paginated full-text search for job postings.
 *
 * - English (locale=en): 'english' PostgreSQL text search config (stemming).
 *   Searches `search_vector` (title A, description B, requirements C, location D).
 * - Igbo (locale=ig): 'simple' config (no stemming — PostgreSQL has no Igbo dictionary).
 *   Searches `search_vector_igbo`.
 *
 * Pagination:
 * - Returns `{ items, nextCursor }`. `nextCursor` is non-null when more rows exist.
 * - Uses the fetch-one-extra trick (LIMIT safeLimit + 1) to detect `hasMore`
 *   without a second COUNT query.
 * - Pass `cursor` (an opaque string from a prior `nextCursor`) to fetch the next page.
 * - `cursor = undefined` or an invalid cursor falls back to page 1 (fail-safe).
 *
 * Sort modes:
 * - "relevance" (default): ts_rank DESC, created_at DESC, id ASC
 * - "date": created_at DESC, id ASC
 * - "salary_asc": salary_min ASC NULLS LAST, id ASC
 * - "salary_desc": salary_max DESC NULLS FIRST, id ASC
 *
 * Stability contract: "between two page fetches at T1 and T2 with no
 * inserts/updates, the same rows appear in the same order at the same
 * positions." See docs/decisions/cursor-pagination.md for the full contract
 * and known caveat for relevance sort under concurrent tsvector updates.
 *
 * Empty / whitespace queries return { items: [], nextCursor: null } immediately.
 * `limit` is clamped server-side to [MIN_LIMIT, MAX_LIMIT].
 */
export async function searchJobPostings({
  query,
  locale,
  limit,
  sort = "relevance",
  cursor,
}: JobSearchParams): Promise<JobSearchPage> {
  if (!query || !query.trim()) {
    return { items: [], nextCursor: null };
  }

  const safeLimit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.floor(limit ?? DEFAULT_LIMIT)));

  const decodedCursor = cursor ? decodeJobSearchCursor(cursor) : null;

  if (locale === "ig") {
    const tsQuery = sql`plainto_tsquery('simple', ${query})`;
    const snippetSource = sql`COALESCE(title, '') || ' ' || regexp_replace(COALESCE(description_igbo_html, ''), '<[^>]+>', ' ', 'g')`;
    const orderBy = buildOrderByIgbo(sort, tsQuery);
    const cursorPredicate = buildCursorPredicateIgbo(decodedCursor, sort, tsQuery);

    const rows = (await db.execute(sql`
      SELECT
        id::text,
        title,
        location,
        salary_min,
        salary_max,
        employment_type,
        created_at::text,
        ts_rank(search_vector_igbo, ${tsQuery})::text AS relevance,
        ts_headline('simple', ${snippetSource}, ${tsQuery}, ${TS_HEADLINE_OPTIONS}) AS snippet
      FROM portal_job_postings
      WHERE status = 'active'
        AND archived_at IS NULL
        AND search_vector_igbo @@ ${tsQuery}
        ${cursorPredicate}
      ${orderBy}
      LIMIT ${safeLimit + 1}
    `)) as unknown as JobSearchResult[];

    return buildPage(rows, safeLimit, sort);
  }

  // Default: English
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  const snippetSource = sql`COALESCE(title, '') || ' ' || regexp_replace(COALESCE(description_html, ''), '<[^>]+>', ' ', 'g')`;
  const orderBy = buildOrderBy(sort, tsQuery);
  const cursorPredicate = buildCursorPredicate(decodedCursor, sort, tsQuery);

  const rows = (await db.execute(sql`
    SELECT
      id::text,
      title,
      location,
      salary_min,
      salary_max,
      employment_type,
      created_at::text,
      ts_rank(search_vector, ${tsQuery})::text AS relevance,
      ts_headline('english', ${snippetSource}, ${tsQuery}, ${TS_HEADLINE_OPTIONS}) AS snippet
    FROM portal_job_postings
    WHERE status = 'active'
      AND archived_at IS NULL
      AND search_vector @@ ${tsQuery}
      ${cursorPredicate}
    ${orderBy}
    LIMIT ${safeLimit + 1}
  `)) as unknown as JobSearchResult[];

  return buildPage(rows, safeLimit, sort);
}

function buildPage(rows: JobSearchResult[], safeLimit: number, sort: JobSearchSort): JobSearchPage {
  const hasMore = rows.length > safeLimit;
  const items = rows.slice(0, safeLimit);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeJobSearchCursor(buildCursorFromRow(last, sort)) : null;
  return { items, nextCursor };
}

// ---------------------------------------------------------------------------
// P-4.1A — Extended filter types and query functions
// ---------------------------------------------------------------------------

/** Facet axis to exclude from filter predicate (for faceted-search semantics) */
export type FacetExclusion = "location" | "employmentType" | "industry" | "salaryRange";

/** Filter object matching the `GET /api/v1/jobs/search` request contract */
export interface JobSearchFilters {
  location?: string[];
  salaryMin?: number;
  salaryMax?: number;
  employmentType?: string[];
  industry?: string[];
  remote?: boolean;
  culturalContext?: {
    diasporaFriendly?: boolean;
    igboPreferred?: boolean;
    communityReferred?: boolean;
  };
}

/** Parameters for searchJobPostingsWithFilters */
export interface FilteredJobSearchParams {
  query?: string;
  locale?: "en" | "ig";
  filters?: JobSearchFilters;
  sort?: JobSearchSort;
  cursor?: string;
  limit?: number;
}

/** Extended row returned by searchJobPostingsWithFilters (adds company fields) */
export interface FilteredJobSearchResult {
  id: string;
  title: string;
  company_name: string | null;
  company_id: string | null; // Added in P-4.1B — additive projection of portal_job_postings.company_id
  logo_url: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_competitive_only: boolean;
  employment_type: string;
  cultural_context_json: Record<string, boolean> | null;
  application_deadline: string | null;
  created_at: string;
  relevance: number | null;
  snippet: string | null;
}

export interface FilteredJobSearchPage {
  items: FilteredJobSearchResult[];
  nextCursor: string | null;
  /**
   * The sort mode actually applied to this page. May differ from the requested
   * sort when `relevance` is requested with an empty query — the backend falls
   * back to `date` since there is no FTS rank to sort by. Surfacing this lets
   * the service and UI detect the fallback instead of silently changing the
   * semantics.
   */
  effectiveSort: JobSearchSort;
}

/** Facet value with count */
export interface DbFacetValue {
  value: string;
  count: number;
}

/** Salary range bucket with count */
export interface DbSalaryRangeFacet {
  bucket: string;
  count: number;
}

/** All facets returned by getJobSearchFacets */
export interface JobSearchFacets {
  location: DbFacetValue[];
  employmentType: DbFacetValue[];
  industry: DbFacetValue[];
  salaryRange: DbSalaryRangeFacet[];
}

// ---------------------------------------------------------------------------
// Filter predicate builder
// ---------------------------------------------------------------------------

/**
 * Builds a SQL fragment (AND clauses) for the given filters.
 *
 * The status gate (status = 'active' AND archived_at IS NULL AND deadline check)
 * is ALWAYS applied; it is not facet-excludable.
 *
 * `excludeFacet` omits the self-facet filter so facet counts reflect
 * "how many results match everything EXCEPT this facet" — standard faceted-search
 * semantics so clicking a facet never yields zero.
 */
export function buildFilterPredicate(
  filters: JobSearchFilters | undefined,
  locale: "en" | "ig",
  excludeFacet?: FacetExclusion,
): ReturnType<typeof sql> {
  const f = filters ?? {};
  const parts: ReturnType<typeof sql>[] = [];

  // Status gate — always applied
  parts.push(
    sql`status = 'active' AND archived_at IS NULL AND (application_deadline IS NULL OR application_deadline > NOW())`,
  );

  // Location filter (OR within)
  if (excludeFacet !== "location" && Array.isArray(f.location) && f.location.length > 0) {
    parts.push(sql`AND location = ANY(${f.location})`);
  }

  // Employment type filter (OR within, cast to enum)
  if (
    excludeFacet !== "employmentType" &&
    Array.isArray(f.employmentType) &&
    f.employmentType.length > 0
  ) {
    parts.push(sql`AND employment_type = ANY(${f.employmentType}::portal_employment_type[])`);
  }

  // Industry filter (OR within, subquery to portal_company_profiles)
  if (excludeFacet !== "industry" && Array.isArray(f.industry) && f.industry.length > 0) {
    parts.push(
      sql`AND company_id IN (SELECT id FROM portal_company_profiles WHERE industry = ANY(${f.industry}))`,
    );
  }

  // Salary range overlap predicate — open-ended NULLs match any bound.
  // See docs/decisions/search-cache-strategy.md §Decision 4.
  if (excludeFacet !== "salaryRange") {
    if (f.salaryMin !== undefined && f.salaryMin !== null) {
      parts.push(sql`AND (salary_max IS NULL OR salary_max >= ${f.salaryMin})`);
    }
    if (f.salaryMax !== undefined && f.salaryMax !== null) {
      parts.push(sql`AND (salary_min IS NULL OR salary_min <= ${f.salaryMax})`);
    }
  }

  // Remote filter — approximation: location matches /remote/i OR diasporaFriendly.
  // TODO(schema): add is_remote boolean column — this regex+JSONB approximation is a
  // stop-gap. See docs/decisions/search-cache-strategy.md §Decision 5.
  if (f.remote === true) {
    parts.push(
      sql`AND (location ~* 'remote' OR (cultural_context_json->>'diasporaFriendly')::boolean = true)`,
    );
  }

  // Cultural context filters (JSONB boolean predicates)
  if (f.culturalContext?.diasporaFriendly === true) {
    parts.push(sql`AND (cultural_context_json->>'diasporaFriendly')::boolean = true`);
  }
  if (f.culturalContext?.igboPreferred === true) {
    // igboPreferred in request → igboLanguagePreferred in DB JSONB
    parts.push(sql`AND (cultural_context_json->>'igboLanguagePreferred')::boolean = true`);
  }
  if (f.culturalContext?.communityReferred === true) {
    parts.push(sql`AND (cultural_context_json->>'communityReferred')::boolean = true`);
  }

  // Combine with sql join (drizzle-orm doesn't have a join util; inline)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void locale; // locale does not affect filter predicate (only FTS vector selection)

  // Build combined predicate by sequentially joining SQL chunks
  if (parts.length === 0) return sql``;
  let combined = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    combined = sql`${combined} ${parts[i]!}`;
  }
  return combined;
}

// ---------------------------------------------------------------------------
// buildFilteredOrderBy / buildFilteredCursorPredicate (locale-aware wrappers)
// ---------------------------------------------------------------------------

function buildFilteredOrderBy(
  sort: JobSearchSort,
  tsQuery?: ReturnType<typeof sql>,
  locale: "en" | "ig" = "en",
): ReturnType<typeof sql> {
  if (locale === "ig") return buildOrderByIgbo(sort, tsQuery);
  return buildOrderBy(sort, tsQuery);
}

function buildFilteredCursorPredicate(
  cursor: JobSearchCursor | null,
  sort: JobSearchSort,
  tsQuery?: ReturnType<typeof sql>,
  locale: "en" | "ig" = "en",
): ReturnType<typeof sql> {
  if (locale === "ig") return buildCursorPredicateIgbo(cursor, sort, tsQuery);
  return buildCursorPredicate(cursor, sort, tsQuery);
}

// ---------------------------------------------------------------------------
// searchJobPostingsWithFilters — production search path
// ---------------------------------------------------------------------------

/**
 * Cursor-paginated full-text search with filter predicates and company JOIN.
 *
 * This is the production path used by the search route. The PoC function
 * (searchJobPostings) is preserved unchanged for PREP-G test compatibility.
 * See TODO(P-4.1-TECHDEBT-1) at the top of this file.
 *
 * SELECT list projection (AC #5 — no large columns):
 * id, title, company_name, logo_url, location, salary_min, salary_max,
 * salary_competitive_only, employment_type, cultural_context_json,
 * application_deadline, created_at, ts_rank/null, ts_headline/null.
 * description_html, description_igbo_html, requirements, search_vector are
 * explicitly excluded.
 *
 * SECURITY: ts_headline produces <mark>-only HTML. The StartSel/StopSel options
 * are hard-coded; no user input reaches the HTML output. Consumer (P-4.1B)
 * is responsible for sanitizing via sanitizeHtml(snippet, { ALLOWED_TAGS: ['mark'] }).
 */
export async function searchJobPostingsWithFilters({
  query,
  locale = "en",
  filters,
  sort = "relevance",
  cursor,
  limit,
}: FilteredJobSearchParams): Promise<FilteredJobSearchPage> {
  const DEFAULT_FILTERED_LIMIT = 20;
  const MAX_FILTERED_LIMIT = 50;
  const MIN_FILTERED_LIMIT = 1;

  const safeLimit = Math.max(
    MIN_FILTERED_LIMIT,
    Math.min(MAX_FILTERED_LIMIT, Math.floor(limit ?? DEFAULT_FILTERED_LIMIT)),
  );

  const decodedCursor = cursor ? decodeJobSearchCursor(cursor) : null;
  const trimmedQuery = query?.trim() ?? "";
  const hasQuery = trimmedQuery.length > 0;

  // When empty query, default sort to "date" (no FTS predicate available)
  const effectiveSort: JobSearchSort = !hasQuery && sort === "relevance" ? "date" : sort;

  const filterPredicate = buildFilterPredicate(filters, locale);

  if (locale === "ig") {
    const tsQuery = hasQuery ? sql`plainto_tsquery('simple', ${trimmedQuery})` : sql`NULL::tsquery`;
    const snippetSource = sql`COALESCE(title, '') || ' ' || regexp_replace(COALESCE(description_igbo_html, ''), '<[^>]+>', ' ', 'g')`;
    const orderBy = buildFilteredOrderBy(effectiveSort, hasQuery ? tsQuery : undefined, "ig");
    const cursorPredicate = buildFilteredCursorPredicate(
      decodedCursor,
      effectiveSort,
      hasQuery ? tsQuery : undefined,
      "ig",
    );

    const rows = (await db.execute(sql`
      SELECT
        pjp.id::text,
        pjp.title,
        cp.name AS company_name,
        pjp.company_id::text AS company_id,
        cp.logo_url,
        pjp.location,
        pjp.salary_min,
        pjp.salary_max,
        pjp.salary_competitive_only,
        pjp.employment_type,
        pjp.cultural_context_json,
        pjp.application_deadline::text,
        pjp.created_at::text,
        ${hasQuery ? sql`ts_rank(pjp.search_vector_igbo, ${tsQuery})` : sql`NULL::float4`} AS relevance,
        ${hasQuery ? sql`ts_headline('simple', ${snippetSource}, ${tsQuery}, ${TS_HEADLINE_OPTIONS})` : sql`NULL::text`} AS snippet
      FROM portal_job_postings pjp
      LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
      WHERE ${filterPredicate}
        ${hasQuery ? sql`AND pjp.search_vector_igbo @@ ${tsQuery}` : sql``}
        ${cursorPredicate}
      ${orderBy}
      LIMIT ${safeLimit + 1}
    `)) as unknown as FilteredJobSearchResult[];

    return buildFilteredPage(rows, safeLimit, effectiveSort);
  }

  // Default: English
  const tsQuery = hasQuery ? sql`plainto_tsquery('english', ${trimmedQuery})` : sql`NULL::tsquery`;
  const snippetSource = sql`COALESCE(pjp.title, '') || ' ' || regexp_replace(COALESCE(pjp.description_html, ''), '<[^>]+>', ' ', 'g')`;
  const orderBy = buildFilteredOrderBy(effectiveSort, hasQuery ? tsQuery : undefined, "en");
  const cursorPredicate = buildFilteredCursorPredicate(
    decodedCursor,
    effectiveSort,
    hasQuery ? tsQuery : undefined,
    "en",
  );

  const rows = (await db.execute(sql`
    SELECT
      pjp.id::text,
      pjp.title,
      cp.name AS company_name,
      pjp.company_id::text AS company_id,
      cp.logo_url,
      pjp.location,
      pjp.salary_min,
      pjp.salary_max,
      pjp.salary_competitive_only,
      pjp.employment_type,
      pjp.cultural_context_json,
      pjp.application_deadline::text,
      pjp.created_at::text,
      ${hasQuery ? sql`ts_rank(pjp.search_vector, ${tsQuery})` : sql`NULL::float4`} AS relevance,
      ${hasQuery ? sql`ts_headline('english', ${snippetSource}, ${tsQuery}, ${TS_HEADLINE_OPTIONS})` : sql`NULL::text`} AS snippet
    FROM portal_job_postings pjp
    LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
    WHERE ${filterPredicate}
      ${hasQuery ? sql`AND pjp.search_vector @@ ${tsQuery}` : sql``}
      ${cursorPredicate}
    ${orderBy}
    LIMIT ${safeLimit + 1}
  `)) as unknown as FilteredJobSearchResult[];

  return buildFilteredPage(rows, safeLimit, effectiveSort);
}

function buildFilteredPage(
  rows: FilteredJobSearchResult[],
  safeLimit: number,
  sort: JobSearchSort,
): FilteredJobSearchPage {
  const hasMore = rows.length > safeLimit;
  const items = rows.slice(0, safeLimit);
  const last = items[items.length - 1];

  let nextCursor: string | null = null;
  if (hasMore && last) {
    // Build cursor from filtered result shape (maps back to JobSearchResult fields)
    const cursorRow: JobSearchResult = {
      id: last.id,
      title: last.title,
      location: last.location,
      salary_min: last.salary_min,
      salary_max: last.salary_max,
      employment_type: last.employment_type,
      created_at: last.created_at,
      relevance: last.relevance !== null ? String(last.relevance) : "0",
      snippet: last.snippet,
    };
    nextCursor = encodeJobSearchCursor(buildCursorFromRow(cursorRow, sort));
  }

  return { items, nextCursor, effectiveSort: sort };
}

// ---------------------------------------------------------------------------
// getJobSearchFacets — facet aggregation (4 parallel queries)
// ---------------------------------------------------------------------------

/**
 * Returns facet counts for location, employmentType, industry, and salaryRange.
 *
 * Each facet query EXCLUDES the self-facet filter (standard faceted-search semantics
 * so clicking a facet never yields zero results).
 *
 * Per AC #8: facet counts reflect "how many active postings match the search +
 * all OTHER filters, grouped by this facet's values".
 */
export async function getJobSearchFacets(
  filters: JobSearchFilters | undefined,
  locale: "en" | "ig",
  query?: string,
): Promise<JobSearchFacets> {
  const trimmedQuery = query?.trim() ?? "";
  const hasQuery = trimmedQuery.length > 0;

  const tsQueryEn = hasQuery ? sql`plainto_tsquery('english', ${trimmedQuery})` : undefined;
  const tsQueryIg = hasQuery ? sql`plainto_tsquery('simple', ${trimmedQuery})` : undefined;
  const tsQuery = locale === "ig" ? tsQueryIg : tsQueryEn;
  const vectorCol = locale === "ig" ? sql`pjp.search_vector_igbo` : sql`pjp.search_vector`;

  function ftsClause() {
    if (!hasQuery || !tsQuery) return sql``;
    return sql`AND ${vectorCol} @@ ${tsQuery}`;
  }

  const [locationRows, employmentTypeRows, industryRows, salaryRangeRows] = await Promise.all([
    // Location facet — excludes location filter
    db.execute(sql`
      SELECT pjp.location AS value, COUNT(*)::int AS count
      FROM portal_job_postings pjp
      LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
      WHERE ${buildFilterPredicate(filters, locale, "location")}
        ${ftsClause()}
        AND pjp.location IS NOT NULL
      GROUP BY pjp.location
      ORDER BY count DESC, pjp.location ASC
    `),

    // EmploymentType facet — excludes employmentType filter
    db.execute(sql`
      SELECT pjp.employment_type::text AS value, COUNT(*)::int AS count
      FROM portal_job_postings pjp
      LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
      WHERE ${buildFilterPredicate(filters, locale, "employmentType")}
        ${ftsClause()}
      GROUP BY pjp.employment_type
      ORDER BY count DESC, pjp.employment_type ASC
    `),

    // Industry facet — excludes industry filter, requires JOIN (industry is on company)
    db.execute(sql`
      SELECT cp.industry AS value, COUNT(*)::int AS count
      FROM portal_job_postings pjp
      LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
      WHERE ${buildFilterPredicate(filters, locale, "industry")}
        ${ftsClause()}
        AND cp.industry IS NOT NULL
      GROUP BY cp.industry
      ORDER BY count DESC, cp.industry ASC
    `),

    // SalaryRange facet — excludes salaryRange filter (salaryMin/salaryMax overlap predicates)
    db.execute(sql`
      SELECT
        CASE
          WHEN pjp.salary_competitive_only = true THEN 'competitive'
          WHEN pjp.salary_min < 50000 OR (pjp.salary_min IS NULL AND pjp.salary_max < 50000) THEN '<50k'
          WHEN pjp.salary_min < 100000 OR (pjp.salary_min IS NULL AND pjp.salary_max < 100000) THEN '50k-100k'
          WHEN pjp.salary_min < 200000 OR (pjp.salary_min IS NULL AND pjp.salary_max < 200000) THEN '100k-200k'
          WHEN pjp.salary_min >= 200000 THEN '>200k'
          ELSE NULL
        END AS bucket,
        COUNT(*)::int AS count
      FROM portal_job_postings pjp
      LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
      WHERE ${buildFilterPredicate(filters, locale, "salaryRange")}
        ${ftsClause()}
      GROUP BY bucket
      HAVING bucket IS NOT NULL
      ORDER BY count DESC
    `),
  ]);

  return {
    location: (locationRows as unknown as { value: string; count: number }[]).map((r) => ({
      value: r.value,
      count: r.count,
    })),
    employmentType: (employmentTypeRows as unknown as { value: string; count: number }[]).map(
      (r) => ({ value: r.value, count: r.count }),
    ),
    industry: (industryRows as unknown as { value: string; count: number }[]).map((r) => ({
      value: r.value,
      count: r.count,
    })),
    salaryRange: (salaryRangeRows as unknown as { bucket: string; count: number }[]).map((r) => ({
      bucket: r.bucket,
      count: r.count,
    })),
  };
}

// ---------------------------------------------------------------------------
// getJobSearchTotalCount
// ---------------------------------------------------------------------------

/**
 * Returns the total count of active postings matching the given filters + query.
 *
 * Per AC #8: acceptable at current scale. Revisit trigger documented in
 * docs/decisions/search-cache-strategy.md §Decision 6.
 */
export async function getJobSearchTotalCount(
  filters: JobSearchFilters | undefined,
  locale: "en" | "ig",
  query?: string,
): Promise<number> {
  const trimmedQuery = query?.trim() ?? "";
  const hasQuery = trimmedQuery.length > 0;

  const filterPredicate = buildFilterPredicate(filters, locale);

  let rows: unknown;
  if (locale === "ig") {
    if (hasQuery) {
      const tsQuery = sql`plainto_tsquery('simple', ${trimmedQuery})`;
      rows = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM portal_job_postings pjp
        LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
        WHERE ${filterPredicate}
          AND pjp.search_vector_igbo @@ ${tsQuery}
      `);
    } else {
      rows = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM portal_job_postings pjp
        LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
        WHERE ${filterPredicate}
      `);
    }
  } else {
    if (hasQuery) {
      const tsQuery = sql`plainto_tsquery('english', ${trimmedQuery})`;
      rows = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM portal_job_postings pjp
        LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
        WHERE ${filterPredicate}
          AND pjp.search_vector @@ ${tsQuery}
      `);
    } else {
      rows = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM portal_job_postings pjp
        LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
        WHERE ${filterPredicate}
      `);
    }
  }

  const result = rows as unknown as { count: number }[];
  return result[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// P-4.2 — Discovery page queries
// ---------------------------------------------------------------------------

/**
 * Discovery job result — same shape as FilteredJobSearchResult minus relevance and snippet.
 * Used by getFeaturedJobPostings and getRecentJobPostings.
 */
export type DiscoveryJobResult = Omit<FilteredJobSearchResult, "relevance" | "snippet">;

/** Industry category with active posting count — returned by getIndustryCategoryCounts */
export interface IndustryCategoryCount {
  industry: string;
  count: number;
}

/**
 * Returns up to `limit` featured active job postings ordered by created_at DESC.
 *
 * Gate: status = 'active' AND archived_at IS NULL AND is_featured = true
 *       AND (application_deadline IS NULL OR application_deadline > NOW())
 *
 * Uses db.execute() raw SQL — same pattern as searchJobPostingsWithFilters.
 */
export async function getFeaturedJobPostings(limit: number): Promise<DiscoveryJobResult[]> {
  const rows = (await db.execute(sql`
    SELECT
      pjp.id::text,
      pjp.title,
      cp.name AS company_name,
      pjp.company_id::text AS company_id,
      cp.logo_url,
      pjp.location,
      pjp.salary_min,
      pjp.salary_max,
      pjp.salary_competitive_only,
      pjp.employment_type,
      pjp.cultural_context_json,
      pjp.application_deadline::text,
      pjp.created_at::text
    FROM portal_job_postings pjp
    LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
    WHERE pjp.status = 'active'
      AND pjp.archived_at IS NULL
      AND pjp.is_featured = true
      AND (pjp.application_deadline IS NULL OR pjp.application_deadline > NOW())
    ORDER BY pjp.created_at DESC
    LIMIT ${limit}
  `)) as unknown as DiscoveryJobResult[];
  return rows;
}

/**
 * Returns industry category counts for active non-archived non-expired postings.
 *
 * JOINs to portal_company_profiles to get the industry field (lives on company, not posting).
 * Excludes categories with zero postings. Sorted by count DESC.
 *
 * Status gate is identical to buildFilterPredicate:
 *   status = 'active' AND archived_at IS NULL AND (application_deadline IS NULL OR application_deadline > NOW())
 */
export async function getIndustryCategoryCounts(): Promise<IndustryCategoryCount[]> {
  const rows = (await db.execute(sql`
    SELECT
      cp.industry,
      COUNT(*)::int AS count
    FROM portal_job_postings pjp
    INNER JOIN portal_company_profiles cp ON cp.id = pjp.company_id
    WHERE pjp.status = 'active'
      AND pjp.archived_at IS NULL
      AND (pjp.application_deadline IS NULL OR pjp.application_deadline > NOW())
      AND cp.industry IS NOT NULL
    GROUP BY cp.industry
    HAVING COUNT(*) > 0
    ORDER BY count DESC
  `)) as unknown as IndustryCategoryCount[];
  return rows;
}

/**
 * Returns up to `limit` most recently activated active job postings ordered by created_at DESC.
 *
 * Same status gate as getFeaturedJobPostings but without the is_featured filter.
 */
export async function getRecentJobPostings(limit: number): Promise<DiscoveryJobResult[]> {
  const rows = (await db.execute(sql`
    SELECT
      pjp.id::text,
      pjp.title,
      cp.name AS company_name,
      pjp.company_id::text AS company_id,
      cp.logo_url,
      pjp.location,
      pjp.salary_min,
      pjp.salary_max,
      pjp.salary_competitive_only,
      pjp.employment_type,
      pjp.cultural_context_json,
      pjp.application_deadline::text,
      pjp.created_at::text
    FROM portal_job_postings pjp
    LEFT JOIN portal_company_profiles cp ON cp.id = pjp.company_id
    WHERE pjp.status = 'active'
      AND pjp.archived_at IS NULL
      AND (pjp.application_deadline IS NULL OR pjp.application_deadline > NOW())
    ORDER BY pjp.created_at DESC
    LIMIT ${limit}
  `)) as unknown as DiscoveryJobResult[];
  return rows;
}
