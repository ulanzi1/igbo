import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { searchMembersWithGeoFallback } from "@/services/geo-search";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const url = new URL(request.url);
  const city = url.searchParams.get("city")?.trim() || undefined;
  const state = url.searchParams.get("state")?.trim() || undefined;
  const country = url.searchParams.get("country")?.trim() || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;
  // limit: 1–50 (default 12 — looks good in a 3-col grid)
  const limitParam = url.searchParams.get("limit");
  let limit = 12;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 50) limit = parsed;
  }
  const result = await searchMembersWithGeoFallback({
    viewerUserId: userId,
    locationCity: city,
    locationState: state,
    locationCountry: country,
    cursor,
    limit,
  });
  return successResponse(result);
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `member-search:${userId}`; // Same bucket as /discover (shared limit)
    },
    ...RATE_LIMIT_PRESETS.MEMBER_SEARCH,
  },
});
