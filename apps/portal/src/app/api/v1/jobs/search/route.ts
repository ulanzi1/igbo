import "server-only";
import { getLocale } from "next-intl/server";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { jobSearchRequestSchema } from "@/lib/validations/job-search";
import { searchJobs } from "@/services/job-search-service";

/**
 * GET /api/v1/jobs/search
 *
 * Public job search endpoint — full-text search with filters, facets, sort,
 * and opaque cursor pagination. Results are cached in Redis for 60 s.
 *
 * Request contract: see jobSearchRequestSchema in @/lib/validations/job-search
 * Response contract: see JobSearchResponse in @/lib/validations/job-search
 *
 * Multi-value params use repeated query strings: ?location=Lagos&location=Toronto
 * Flat culturalContext params: ?culturalContextDiasporaFriendly=true
 *
 * SECURITY: locale is server-derived from next-intl request context — NEVER read
 * from client input. Reading locale from searchParams would allow cache poisoning.
 *
 * TODO: Rate limiting — cross-cutting story will add middleware here.
 *
 * skipCsrf=true: GET endpoint with no side effects; CSRF-exempt by convention.
 * Required so bookmarked URLs, SEO crawlers, and server-side fetches work without
 * an Origin header. Matches community search route pattern.
 */
export const GET = withApiHandler(
  async (req) => {
    const { searchParams } = new URL(req.url);

    // Parse multi-value array params
    const location = searchParams.getAll("location");
    const employmentType = searchParams.getAll("employmentType");
    const industry = searchParams.getAll("industry");

    // Parse scalar params
    const query = searchParams.get("query") ?? undefined;
    const sort = searchParams.get("sort") ?? undefined;
    const cursor = searchParams.get("cursor") ?? undefined;
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw !== null ? Number(limitRaw) : undefined;

    // Flat culturalContext params: ?culturalContextDiasporaFriendly=true
    const diasporaFriendlyRaw = searchParams.get("culturalContextDiasporaFriendly");
    const igboPreferredRaw = searchParams.get("culturalContextIgboPreferred");
    const communityReferredRaw = searchParams.get("culturalContextCommunityReferred");
    const remoteRaw = searchParams.get("remote");
    const salaryMinRaw = searchParams.get("salaryMin");
    const salaryMaxRaw = searchParams.get("salaryMax");

    /**
     * Strict boolean query-param parser.
     * - null          → undefined (param absent)
     * - "true"        → true
     * - "false"       → false
     * - anything else → null (treated as validation error by caller)
     *
     * Previously this silently coerced any non-"true" value to false, which
     * meant `?remote=yes` or `?remote=1` produced false filters instead of
     * 400 errors. Now invalid values reject via the Zod schema.
     */
    function parseBoolParam(val: string | null): boolean | undefined | null {
      if (val === null) return undefined;
      if (val === "true") return true;
      if (val === "false") return false;
      return null;
    }

    const culturalContextInput: Record<string, boolean> = {};
    const diasporaFriendly = parseBoolParam(diasporaFriendlyRaw);
    const igboPreferred = parseBoolParam(igboPreferredRaw);
    const communityReferred = parseBoolParam(communityReferredRaw);
    const remote = parseBoolParam(remoteRaw);

    if (
      diasporaFriendly === null ||
      igboPreferred === null ||
      communityReferred === null ||
      remote === null
    ) {
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: "Boolean filter parameters must be exactly 'true' or 'false'.",
      });
    }

    if (diasporaFriendly !== undefined) culturalContextInput.diasporaFriendly = diasporaFriendly;
    if (igboPreferred !== undefined) culturalContextInput.igboPreferred = igboPreferred;
    if (communityReferred !== undefined) culturalContextInput.communityReferred = communityReferred;

    // Build the raw request object for schema validation
    const rawRequest: Record<string, unknown> = { sort, cursor, limit };
    if (query !== undefined) rawRequest.query = query;

    const filters: Record<string, unknown> = {};
    if (location.length > 0) filters.location = location;
    if (employmentType.length > 0) filters.employmentType = employmentType;
    if (industry.length > 0) filters.industry = industry;
    // Only forward `remote=true` — the filter predicate is a no-op when false,
    // so storing `false` would just bloat the cache key while yielding the
    // same result as omitting the filter entirely. `remote=false` is
    // explicitly accepted at the URL level but folded into "filter absent".
    if (remote === true) filters.remote = true;
    if (salaryMinRaw !== null) filters.salaryMin = Number(salaryMinRaw);
    if (salaryMaxRaw !== null) filters.salaryMax = Number(salaryMaxRaw);
    if (Object.keys(culturalContextInput).length > 0)
      filters.culturalContext = culturalContextInput;
    if (Object.keys(filters).length > 0) rawRequest.filters = filters;

    // Validate request against schema
    const parsed = jobSearchRequestSchema.safeParse(rawRequest);
    if (!parsed.success) {
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    // SECURITY: locale is server-derived from next-intl request context — NEVER read from client input.
    const rawLocale = await getLocale();
    const locale: "en" | "ig" = rawLocale === "ig" ? "ig" : "en";

    const response = await searchJobs(parsed.data, locale);

    const successRes = successResponse(response, undefined, 200);
    // CDN caching — aligns with Redis TTL (60 s) and stale-while-revalidate for smooth transitions.
    successRes.headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
    );
    return successRes;
  },
  { skipCsrf: true },
);
