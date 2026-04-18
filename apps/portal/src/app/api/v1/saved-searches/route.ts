import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse, errorResponse } from "@/lib/api-response";
import { createSavedSearchSchema } from "@/lib/validations/saved-search";
import { saveSavedSearch, getMySearches } from "@/services/saved-search-service";

/**
 * GET /api/v1/saved-searches
 * Returns all saved searches for the authenticated seeker.
 */
export const GET = withApiHandler(
  async (_req) => {
    const session = await auth();
    if (!session?.user) {
      throw new ApiError({ title: "Unauthorized", status: 401 });
    }
    if (session.user.activePortalRole !== "JOB_SEEKER") {
      return successResponse({ searches: [] });
    }

    const searches = await getMySearches(session.user.id);
    return successResponse({ searches });
  },
  { skipCsrf: true },
);

/**
 * POST /api/v1/saved-searches
 * Creates a new saved search for the authenticated seeker.
 */
export const POST = withApiHandler(async (req) => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
  if (session.user.activePortalRole !== "JOB_SEEKER") {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSavedSearchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse({
      type: "validation_error",
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  const search = await saveSavedSearch(session.user.id, {
    name: parsed.data.name,
    searchParams: parsed.data.searchParams,
    alertFrequency: parsed.data.alertFrequency,
  });

  return successResponse({ search }, undefined, 201);
});
