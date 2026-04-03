import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { markNotificationAsRead } from "@/services/notification-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  // Extract notification [id] from URL: .../notifications/{id}/read
  const segments = new URL(request.url).pathname.split("/");
  const id = segments.at(-2) ?? "";

  if (!UUID_REGEX.test(id)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid notification ID format",
    });
  }

  const updated = await markNotificationAsRead(id, userId);

  if (!updated) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "Notification not found",
    });
  }

  return successResponse({ id, isRead: true });
};

export const PATCH = withApiHandler(handler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `notification-read:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.PROFILE_UPDATE, // 20/min per userId
  },
});
