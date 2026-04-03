import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getMemberSuggestions } from "@/services/suggestion-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  let limit = 5;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) limit = parsed;
  }
  const suggestions = await getMemberSuggestions(userId, limit);
  return successResponse({ suggestions });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async (_request: Request) => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `member-suggestions:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MEMBER_SUGGESTIONS,
  },
});
