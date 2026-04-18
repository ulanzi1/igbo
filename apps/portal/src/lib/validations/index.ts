// Re-exports for P-4.1B, P-4.6, P-4.7 consumers.
// Do NOT re-validate downstream — import and use these schemas directly.
export {
  jobSearchRequestSchema,
  getCulturalContextField,
  SALARY_RANGE_BUCKETS,
  PORTAL_EMPLOYMENT_TYPES,
  type JobSearchRequest,
  type JobSearchResponse,
  type JobSearchResultItem,
  type CulturalContextFlags,
  type FacetValue,
  type SalaryRangeFacet,
  type PortalEmploymentTypeValue,
} from "./job-search";
