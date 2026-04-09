import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import {
  getApplicationDetailForSeeker,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  // Extract applicationId from URL: /api/v1/applications/{applicationId}
  const applicationId = new URL(req.url).pathname.split("/").at(-1);
  if (!applicationId) {
    throw new ApiError({ title: "Missing applicationId", status: 400 });
  }

  const application = await getApplicationDetailForSeeker(applicationId, session.user.id);
  if (!application) {
    // Return 404 (not 403) to prevent information leakage
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  const transitions = await getTransitionHistory(applicationId);

  return successResponse({ application, transitions });
});
