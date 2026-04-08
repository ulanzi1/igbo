import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";

export const GET = withApiHandler(async (_req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();
  const profile = await getSeekerProfileByUserId(session.user.id);
  return successResponse(profile ?? null);
});
