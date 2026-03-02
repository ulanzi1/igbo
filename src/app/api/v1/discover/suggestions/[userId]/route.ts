import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { dismissSuggestion } from "@/services/suggestion-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { z } from "zod/v4";

const UUIDSchema = z.string().uuid();

const deleteHandler = async (request: Request) => {
  const { userId: viewerUserId } = await requireAuthenticatedSession();
  const dismissedUserId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  const parsed = UUIDSchema.safeParse(dismissedUserId);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid request",
    });
  }
  await dismissSuggestion(viewerUserId, parsed.data);
  return successResponse({ dismissed: true });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async (_request: Request) => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `suggestion-dismiss:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.SUGGESTION_DISMISS,
  },
});
