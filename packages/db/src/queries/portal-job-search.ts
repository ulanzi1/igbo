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
