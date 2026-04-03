// GET /api/v1/user/bookmarks → paginated list of bookmarked posts
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getUserBookmarks } from "@/services/bookmark-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 50);

  const result = await getUserBookmarks(userId, { cursor, limit });
  return successResponse(result);
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `bookmark-list:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.BOOKMARK_LIST,
  },
});
