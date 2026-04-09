import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { getSeekerAnalytics } from "@/services/seeker-analytics-service";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

export const GET = withApiHandler(async () => {
  const session = await requireJobSeekerRole();

  const analytics = await getSeekerAnalytics(session.user.id);
  if (!analytics) {
    throw new ApiError({
      title: "Seeker profile not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  return successResponse(analytics);
});
