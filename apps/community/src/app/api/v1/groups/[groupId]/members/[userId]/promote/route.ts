// POST /api/v1/groups/[groupId]/members/[userId]/promote — assign leader role
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { assignGroupLeader } from "@/services/group-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const postHandler = async (request: Request) => {
  const { userId: actorId } = await requireAuthenticatedSession();

  const segments = new URL(request.url).pathname.split("/");
  // .../groups/{groupId}/members/{userId}/promote
  const groupId = segments.at(-4);
  const targetUserId = segments.at(-2);

  if (!groupId || !uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  if (!targetUserId || !uuidRegex.test(targetUserId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
  }

  await assignGroupLeader(actorId, groupId, targetUserId);

  return successResponse({ promoted: true }, undefined, 201);
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `group-manage:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_MANAGE,
  },
});
