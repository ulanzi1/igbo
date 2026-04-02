import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { searchMessages } from "@igbo/db/queries/chat-conversations";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitParam = url.searchParams.get("limit");

  if (q.length < 3) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Search query must be at least 3 characters",
    });
  }

  let limit = 20;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 50) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Invalid 'limit': must be 1–50",
      });
    }
    limit = parsed;
  }

  const results = await searchMessages(userId, q, limit);
  return successResponse({ results, query: q });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `message-search:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MESSAGE_SEARCH,
  },
});
