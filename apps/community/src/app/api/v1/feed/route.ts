import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getFeed } from "@/services/feed-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import type { FeedSortMode, FeedFilter } from "@igbo/config/feed";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const url = new URL(request.url);

  const sortParam = url.searchParams.get("sort") ?? "chronological";
  const filterParam = url.searchParams.get("filter") ?? "all";
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 1), 50) : undefined;

  // Validate sort and filter values BEFORE narrowing the type
  if (!["chronological", "algorithmic"].includes(sortParam)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid sort parameter" });
  }
  if (!["all", "announcements"].includes(filterParam)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid filter parameter" });
  }

  const sort = sortParam as FeedSortMode;
  const filter = filterParam as FeedFilter;

  const page = await getFeed(userId, { sort, filter, cursor, limit });
  return successResponse(page);
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `feed-read:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.FEED_READ,
  },
});
