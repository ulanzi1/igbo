import { z } from "zod/v4";

// Inline enum values — avoids importing from @igbo/db/schema (has "server-only")
// which breaks client component imports. Must stay in sync with portalEmploymentTypeEnum.
export const PORTAL_EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "apprenticeship",
] as const;

export type PortalEmploymentTypeValue = (typeof PORTAL_EMPLOYMENT_TYPES)[number];

/**
 * Maps the request-contract field name `igboPreferred` to the schema column name
 * `igboLanguagePreferred`. The mismatch exists because the epic spec used a shorter
 * name, but the DB column was already named `igboLanguagePreferred` when the
 * cultural context JSONB shape was locked. Do NOT rename the schema field.
 */
export function getCulturalContextField(
  requestKey: "diasporaFriendly" | "igboPreferred" | "communityReferred",
): string {
  if (requestKey === "igboPreferred") return "igboLanguagePreferred";
  return requestKey;
}

/**
 * Salary range buckets for facet aggregation.
 * The `competitive` bucket covers postings with salary_competitive_only = true.
 */
export const SALARY_RANGE_BUCKETS = [
  { key: "<50k", min: 0, max: 50000 },
  { key: "50k-100k", min: 50000, max: 100000 },
  { key: "100k-200k", min: 100000, max: 200000 },
  { key: ">200k", min: 200000, max: null },
  { key: "competitive", competitiveOnly: true },
] as const;

const culturalContextFilterSchema = z.object({
  diasporaFriendly: z.boolean().optional(),
  igboPreferred: z.boolean().optional(),
  communityReferred: z.boolean().optional(),
});

/**
 * Zod v4 schema for `GET /api/v1/jobs/search` request.
 * Single source of truth consumed by P-4.1B, P-4.6, P-4.7.
 * Do NOT re-validate downstream — re-export and use this schema directly.
 */
export const jobSearchRequestSchema = z
  .object({
    query: z.string().optional(),
    filters: z
      .object({
        location: z.array(z.string()).optional(),
        salaryMin: z.number().int().nonnegative().optional(),
        salaryMax: z.number().int().nonnegative().optional(),
        employmentType: z.array(z.enum(PORTAL_EMPLOYMENT_TYPES)).optional(),
        industry: z.array(z.string()).optional(),
        remote: z.boolean().optional(),
        culturalContext: culturalContextFilterSchema.optional(),
      })
      .optional(),
    sort: z.enum(["relevance", "date", "salary_asc", "salary_desc"]).default("relevance"),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export type JobSearchRequest = z.infer<typeof jobSearchRequestSchema>;

/** Cultural context flags shape — matches culturalContextJson JSONB keys on portal_job_postings */
export type CulturalContextFlags = {
  diasporaFriendly?: boolean;
  igboLanguagePreferred?: boolean;
  communityReferred?: boolean;
};

/** Single job result as returned by the search API */
export interface JobSearchResultItem {
  id: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCompetitiveOnly: boolean;
  employmentType: PortalEmploymentTypeValue;
  culturalContext: CulturalContextFlags | null;
  applicationDeadline: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  relevance: number | null; // ts_rank; null for non-relevance sort
  snippet: string | null; // ts_headline output — sanitized by consumer (P-4.1B)
}

/** Facet value with count */
export interface FacetValue {
  value: string;
  count: number;
}

/** Salary range facet bucket */
export interface SalaryRangeFacet {
  bucket: string;
  count: number;
}

/** Full response shape from `GET /api/v1/jobs/search` */
export interface JobSearchResponse {
  results: JobSearchResultItem[];
  facets: {
    location: FacetValue[];
    employmentType: FacetValue[];
    industry: FacetValue[];
    salaryRange: SalaryRangeFacet[];
  };
  pagination: {
    nextCursor: string | null;
    totalCount: number;
    /**
     * The sort mode actually applied to this result set.
     *
     * Equals the requested sort except when `sort=relevance` was requested
     * with an empty query — in that case there is no FTS rank available, so
     * the backend falls back to `date`. Returning `effectiveSort` lets the UI
     * visibly reflect the fallback (or ignore it) rather than discover it
     * through misaligned pagination.
     */
    effectiveSort: "relevance" | "date" | "salary_asc" | "salary_desc";
  };
}
