import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { runGlobalSearch } from "@/db/queries/search";

const VALID_TYPES = [
  "members",
  "posts",
  "articles",
  "groups",
  "events",
  "documents",
  "all",
] as const;
type SearchType = (typeof VALID_TYPES)[number];

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const typeParam = url.searchParams.get("type") ?? "all";
  const cursorParam = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");

  if (q.length < 3) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Search query must be at least 3 characters",
    });
  }

  if (!VALID_TYPES.includes(typeParam as SearchType)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid 'type': must be one of ${VALID_TYPES.join(", ")}`,
    });
  }

  let limit = 5;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 20) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Invalid 'limit': must be 1–20",
      });
    }
    limit = parsed;
  }

  const result = await runGlobalSearch({
    query: q,
    type: typeParam as SearchType,
    viewerUserId: userId,
    limit,
    cursor: cursorParam,
  });

  return successResponse({
    query: q,
    sections: result.sections,
    pageInfo: result.pageInfo,
  });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async (req) => {
      const ip = req.headers.get("x-client-ip") ?? "anonymous";
      return `global-search:${ip}`;
    },
    ...RATE_LIMIT_PRESETS.GLOBAL_SEARCH,
  },
});
