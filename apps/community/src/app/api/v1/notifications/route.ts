import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getNotifications, getUnreadCount } from "@/db/queries/notifications";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const limitParam = url.searchParams.get("limit");

  let since: Date | undefined;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (isNaN(parsed.getTime())) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Invalid 'since' date format",
      });
    }
    since = parsed;
  }

  let limit: number | undefined;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Invalid 'limit' value: must be between 1 and 100",
      });
    }
    limit = parsed;
  }

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(userId, { since, limit }),
    getUnreadCount(userId),
  ]);

  return successResponse({ notifications, unreadCount });
};

export const GET = withApiHandler(handler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `notifications-fetch:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.NOTIFICATION_FETCH,
  },
});
