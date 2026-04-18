/**
 * Bidirectional serializer between the canonical URL query-string schema (AC #2)
 * and a typed `JobSearchUrlState` object used by the `useJobSearch` hook.
 *
 * URL schema (matches GET /api/v1/jobs/search parameter names):
 *   q                             — search query string
 *   sort                          — relevance | date | salary_asc | salary_desc
 *   cursor                        — opaque base64url cursor (pagination only)
 *   location                      — repeated param (multi-value)
 *   employmentType                — repeated param (multi-value)
 *   industry                      — repeated param (multi-value)
 *   salaryMin, salaryMax          — integer scalars
 *   remote                        — "true" only (absent = off; "false" is never emitted)
 *   culturalContextDiasporaFriendly  — "true" only
 *   culturalContextIgboPreferred     — "true" only
 *   culturalContextCommunityReferred — "true" only
 *
 * Invariants (matching P-4.1A review fixes):
 *   - Default / empty values are OMITTED from the URL (no `sort=relevance` when default).
 *   - Boolean flags are only emitted as "true" — never "false" (M1 compliance).
 *   - Invalid values in the URL are silently dropped (graceful URL degradation).
 */

import type { PortalEmploymentTypeValue } from "@/lib/validations/job-search";
import { PORTAL_EMPLOYMENT_TYPES } from "@/lib/validations/job-search";
export type { PortalEmploymentTypeValue };

export const VALID_SORT_VALUES = ["relevance", "date", "salary_asc", "salary_desc"] as const;
export type SortValue = (typeof VALID_SORT_VALUES)[number];

export interface JobSearchUrlState {
  q: string; // empty string = no query
  sort: SortValue;
  cursor: string | null;
  location: string[];
  employmentType: PortalEmploymentTypeValue[];
  industry: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  remote: boolean;
  culturalContextDiasporaFriendly: boolean;
  culturalContextIgboPreferred: boolean;
  culturalContextCommunityReferred: boolean;
}

export const DEFAULT_SEARCH_STATE: JobSearchUrlState = {
  q: "",
  sort: "relevance",
  cursor: null,
  location: [],
  employmentType: [],
  industry: [],
  salaryMin: null,
  salaryMax: null,
  remote: false,
  culturalContextDiasporaFriendly: false,
  culturalContextIgboPreferred: false,
  culturalContextCommunityReferred: false,
};

/**
 * Parse a URLSearchParams (or Record) into a typed JobSearchUrlState.
 * Invalid values are silently dropped — a mistyped bookmark degrades gracefully.
 */
export function parseSearchUrlParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): JobSearchUrlState {
  // Normalize input into a getter interface
  function getAll(key: string): string[] {
    if (params instanceof URLSearchParams) {
      return params.getAll(key);
    }
    const val = (params as Record<string, string | string[] | undefined>)[key];
    if (val === undefined) return [];
    return Array.isArray(val) ? val : [val];
  }
  function get(key: string): string | null {
    if (params instanceof URLSearchParams) {
      return params.get(key);
    }
    const val = (params as Record<string, string | string[] | undefined>)[key];
    if (val === undefined) return null;
    return Array.isArray(val) ? (val[0] ?? null) : val;
  }

  // q
  const q = get("q") ?? "";

  // sort — validate against allowed values; default to "relevance"
  const rawSort = get("sort") ?? "";
  const sort: SortValue = (VALID_SORT_VALUES as readonly string[]).includes(rawSort)
    ? (rawSort as SortValue)
    : "relevance";

  // cursor
  const cursor = get("cursor") ?? null;

  // location — multi-value array; filter out empty strings
  const location = getAll("location").filter(Boolean);

  // employmentType — multi-value; validate each value
  const employmentType = getAll("employmentType").filter((v): v is PortalEmploymentTypeValue =>
    (PORTAL_EMPLOYMENT_TYPES as readonly string[]).includes(v),
  );

  // industry — multi-value; arbitrary strings allowed
  const industry = getAll("industry").filter(Boolean);

  // salaryMin / salaryMax — parse as integers, drop non-integer values
  const rawMin = get("salaryMin");
  const salaryMin = rawMin !== null && /^\d+$/.test(rawMin) ? parseInt(rawMin, 10) : null;

  const rawMax = get("salaryMax");
  const salaryMax = rawMax !== null && /^\d+$/.test(rawMax) ? parseInt(rawMax, 10) : null;

  // remote — only "true" is honoured (M1: absence = off)
  const remote = get("remote") === "true";

  // Cultural context flags — only "true" is honoured
  const culturalContextDiasporaFriendly = get("culturalContextDiasporaFriendly") === "true";
  const culturalContextIgboPreferred = get("culturalContextIgboPreferred") === "true";
  const culturalContextCommunityReferred = get("culturalContextCommunityReferred") === "true";

  return {
    q,
    sort,
    cursor,
    location,
    employmentType,
    industry,
    salaryMin,
    salaryMax,
    remote,
    culturalContextDiasporaFriendly,
    culturalContextIgboPreferred,
    culturalContextCommunityReferred,
  };
}

/**
 * Serialize a JobSearchUrlState back into a URLSearchParams.
 *
 * Invariants:
 *   - Default values are OMITTED (clean URLs).
 *   - Boolean flags are only emitted when true.
 *   - Empty arrays and empty strings are omitted.
 */
export function serializeSearchUrlParams(state: JobSearchUrlState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.q) params.set("q", state.q);
  if (state.sort !== "relevance") params.set("sort", state.sort);
  if (state.cursor) params.set("cursor", state.cursor);

  for (const loc of state.location) {
    if (loc) params.append("location", loc);
  }
  for (const et of state.employmentType) {
    params.append("employmentType", et);
  }
  for (const ind of state.industry) {
    if (ind) params.append("industry", ind);
  }

  if (state.salaryMin !== null) params.set("salaryMin", String(state.salaryMin));
  if (state.salaryMax !== null) params.set("salaryMax", String(state.salaryMax));
  if (state.remote) params.set("remote", "true");
  if (state.culturalContextDiasporaFriendly) params.set("culturalContextDiasporaFriendly", "true");
  if (state.culturalContextIgboPreferred) params.set("culturalContextIgboPreferred", "true");
  if (state.culturalContextCommunityReferred)
    params.set("culturalContextCommunityReferred", "true");

  return params;
}

/**
 * Count the number of "active" filters for the badge display.
 * Excludes `q` (query) and `sort` — only pure filter fields count.
 */
export function countActiveFilters(state: JobSearchUrlState): number {
  let count = 0;
  count += state.location.length;
  count += state.employmentType.length;
  count += state.industry.length;
  if (state.salaryMin !== null) count++;
  if (state.salaryMax !== null) count++;
  if (state.remote) count++;
  if (state.culturalContextDiasporaFriendly) count++;
  if (state.culturalContextIgboPreferred) count++;
  if (state.culturalContextCommunityReferred) count++;
  return count;
}
