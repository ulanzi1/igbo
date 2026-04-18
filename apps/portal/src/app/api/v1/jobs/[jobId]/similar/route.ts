import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getSimilarJobs } from "@/services/job-search-service";
import type { DiscoveryJobResult } from "@igbo/db/queries/portal-job-search";
import type { JobSearchResultItem } from "@/lib/validations/job-search";

/** Statuses for which the similar jobs tab makes sense. */
const VIEWABLE_STATUSES = new Set(["active", "expired", "filled"]);

/** Converts a DiscoveryJobResult (DB shape) to a JobSearchResultItem (UI shape). */
function toResultItem(row: DiscoveryJobResult): JobSearchResultItem {
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name ?? "",
    companyId: row.company_id,
    companyLogoUrl: row.logo_url,
    location: row.location,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCompetitiveOnly: row.salary_competitive_only,
    employmentType: row.employment_type as JobSearchResultItem["employmentType"],
    culturalContext: row.cultural_context_json as JobSearchResultItem["culturalContext"],
    applicationDeadline: row.application_deadline,
    createdAt: row.created_at,
    relevance: null,
    snippet: null,
  };
}

/**
 * GET /api/v1/jobs/[jobId]/similar
 *
 * Returns up to 6 similar job postings for the given job.
 * Accessible to guests (GET, no side effects).
 *
 * - 404 when the posting is not found or has a non-viewable status
 * - { data: { jobs: [] } } when the company has no industry set
 */
export const GET = withApiHandler(
  async (req) => {
    // Extract jobId from URL: /api/v1/jobs/{jobId}/similar → at(-2)
    const jobId = new URL(req.url).pathname.split("/").at(-2);
    if (!jobId) {
      throw new ApiError({ title: "Job ID required", status: 400 });
    }

    const result = await getJobPostingWithCompany(jobId);
    if (!result || !VIEWABLE_STATUSES.has(result.posting.status)) {
      throw new ApiError({ title: "Not found", status: 404 });
    }

    const { posting, company } = result;

    // If company has no industry, no category to match against → empty
    if (!company.industry) {
      return successResponse({ jobs: [] as JobSearchResultItem[] });
    }

    // Extract locale from Accept-Language header (best-effort, fallback to "en")
    const acceptLanguage = req.headers.get("Accept-Language") ?? "";
    const locale = acceptLanguage.startsWith("ig") ? "ig" : "en";

    const similarJobs = await getSimilarJobs(
      jobId,
      company.industry,
      posting.requirements,
      posting.location,
      locale,
    );

    const jobs = similarJobs.map(toResultItem);
    return successResponse({ jobs });
  },
  { skipCsrf: true },
);
