import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse, errorResponse } from "@/lib/api-response";
import { updateSavedSearchSchema } from "@/lib/validations/saved-search";
import { updateMySearch, deleteMySearch } from "@/services/saved-search-service";

/**
 * PATCH /api/v1/saved-searches/[id]
 * Updates a saved search (name and/or alertFrequency).
 */
export const PATCH = withApiHandler(async (req) => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
  if (session.user.activePortalRole !== "JOB_SEEKER") {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }

  const searchId = new URL(req.url).pathname.split("/").at(-1)!;

  const body = await req.json().catch(() => null);
  const parsed = updateSavedSearchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  const updated = await updateMySearch(session.user.id, searchId, parsed.data);
  return successResponse({ search: updated });
});

/**
 * DELETE /api/v1/saved-searches/[id]
 * Deletes a saved search owned by the authenticated seeker.
 */
export const DELETE = withApiHandler(
  async (req) => {
    const session = await auth();
    if (!session?.user) {
      throw new ApiError({ title: "Unauthorized", status: 401 });
    }
    if (session.user.activePortalRole !== "JOB_SEEKER") {
      throw new ApiError({ title: "Forbidden", status: 403 });
    }

    const searchId = new URL(req.url).pathname.split("/").at(-1)!;
    await deleteMySearch(session.user.id, searchId);
    return successResponse({ deleted: true });
  },
  { skipCsrf: true },
);
