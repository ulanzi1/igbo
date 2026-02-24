import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import * as profileService from "@/services/profile-service";
import type { SocialProvider } from "@/features/profiles/types";

const ALLOWED_PROVIDERS = ["FACEBOOK", "LINKEDIN", "TWITTER", "INSTAGRAM"] as const;

function isValidProvider(p: string): p is SocialProvider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p.toUpperCase());
}

export const DELETE = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  // Path: /api/v1/profiles/social-link/[provider]/unlink
  const provider = pathParts[pathParts.length - 2]?.toUpperCase() ?? "";

  if (!isValidProvider(provider)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid provider" });
  }

  const { userId } = await requireAuthenticatedSession();

  await profileService.unlinkSocialAccount(userId, provider as SocialProvider);

  return successResponse({ unlinked: true });
});
