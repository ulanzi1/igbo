import { withApiHandler } from "@/server/api/middleware";
import { auth } from "@igbo/auth";
import { getOnboardingState } from "@/services/onboarding-service";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";

export const GET = withApiHandler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }

  const state = await getOnboardingState(session.user.id);
  return successResponse(state);
});
