import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import {
  getSeekerProfileByUserId,
  updateSeekerVisibility,
} from "@igbo/db/queries/portal-seeker-profiles";
import { seekerVisibilitySchema } from "@/lib/validations/seeker-visibility";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

export const PATCH = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  const body = await req.json().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  });

  const parsed = seekerVisibilitySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const profile = await getSeekerProfileByUserId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 404,
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }

  const updated = await updateSeekerVisibility(session.user.id, parsed.data.visibility);
  if (!updated) {
    throw new ApiError({ title: "Update failed", status: 500 });
  }

  return successResponse(updated);
});
