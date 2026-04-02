import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { markAllNotificationsAsRead } from "@/services/notification-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const handler = async () => {
  const { userId } = await requireAuthenticatedSession();

  await markAllNotificationsAsRead(userId);

  return successResponse({ success: true });
};

export const POST = withApiHandler(handler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `notification-read-all:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.PROFILE_UPDATE, // 20/min per userId
  },
});
