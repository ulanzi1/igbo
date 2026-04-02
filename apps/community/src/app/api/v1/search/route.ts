import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { runGlobalSearch } from "@igbo/db/queries/search";
import type { SearchFilters } from "@igbo/db/queries/search";

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

const FilterSchema = z.object({
  type: z.enum(["members", "posts", "articles", "groups", "events", "documents", "all"]).optional(),
  dateRange: z.enum(["today", "week", "month", "custom"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  authorId: z.string().optional(),
  category: z.enum(["discussion", "event", "announcement"]).optional(),
  location: z.string().max(200).optional(),
  membershipTier: z.enum(["BASIC", "PROFESSIONAL", "TOP_TIER"]).optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
  q: z.string().optional(),
});

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

  let limit = 10;
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

  // Parse filter params
  const rawParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    rawParams[key] = value;
  });
  const parsed = FilterSchema.safeParse(rawParams);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid filter parameters",
    });
  }

  const { dateRange, dateFrom, dateTo, authorId, category, location, membershipTier } = parsed.data;

  // dateRange=custom requires both dateFrom and dateTo
  if (dateRange === "custom" && (!dateFrom || !dateTo)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "dateRange=custom requires both dateFrom and dateTo",
    });
  }

  const filters: SearchFilters = {
    dateRange,
    dateFrom,
    dateTo,
    authorId,
    category,
    location,
    membershipTier,
  };

  // Only pass filters object when in filtered mode (single type, not "all")
  const isFilteredMode = typeParam !== "all" && typeParam !== "documents";
  const filtersToPass = isFilteredMode ? filters : undefined;

  const result = await runGlobalSearch({
    query: q,
    type: typeParam as SearchType,
    viewerUserId: userId,
    limit,
    cursor: cursorParam,
    filters: filtersToPass,
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
