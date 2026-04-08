import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  getSeekerProfileByUserId,
  markSeekerOnboardingComplete,
} from "@igbo/db/queries/portal-seeker-profiles";

export const POST = withApiHandler(async (_req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  const profile = await getSeekerProfileByUserId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 404,
      detail: "You must create a seeker profile before completing onboarding",
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }

  // Idempotent: markSeekerOnboardingComplete returns null if already marked (WHERE IS NULL guard)
  // This is expected — do NOT treat null as an error. Always return success.
  await markSeekerOnboardingComplete(profile.id);

  return successResponse({ completed: true });
});
