import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { getRecommendedGroupsForUser } from "@/services/recommendation-service";

const getHandler = async () => {
  const { userId } = await requireAuthenticatedSession();
  const groups = await getRecommendedGroupsForUser(userId);
  return successResponse({ groups });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: (req) => {
      const ip = req.headers.get("x-client-ip") ?? "anonymous";
      return `group-recommendations:${ip}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_LIST,
  },
});
