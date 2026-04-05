import "server-only";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getCompanyByOwnerId, markOnboardingComplete } from "@igbo/db/queries/portal-companies";

export const POST = withApiHandler(async (_req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  const profile = await getCompanyByOwnerId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Company profile required",
      status: 404,
      detail: "You must have a company profile to complete onboarding",
    });
  }

  await markOnboardingComplete(profile.id);

  return successResponse({ success: true });
});
