import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { searchMembersInDirectory } from "@/services/geo-search";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? undefined;
  const city = url.searchParams.get("city")?.trim() || undefined;
  const state = url.searchParams.get("state")?.trim() || undefined;
  const country = url.searchParams.get("country")?.trim() || undefined;
  const interests = url.searchParams.getAll("interests").filter(Boolean);
  const language = url.searchParams.get("language") || undefined;
  const tier = url.searchParams.get("tier") as "BASIC" | "PROFESSIONAL" | "TOP_TIER" | undefined;
  const cursor = url.searchParams.get("cursor") || undefined;
  const limitParam = url.searchParams.get("limit");

  let limit = 20;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 50) limit = parsed;
  }

  const validTiers = ["BASIC", "PROFESSIONAL", "TOP_TIER", undefined];
  const safeTier = validTiers.includes(tier) ? tier : undefined;

  const result = await searchMembersInDirectory({
    viewerUserId: userId,
    query: q,
    locationCity: city,
    locationState: state,
    locationCountry: country,
    interests: interests.length > 0 ? interests : undefined,
    language,
    membershipTier: safeTier,
    cursor,
    limit,
  });

  return successResponse(result);
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `member-search:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MEMBER_SEARCH,
  },
});
