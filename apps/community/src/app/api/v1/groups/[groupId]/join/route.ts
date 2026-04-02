// POST /api/v1/groups/[groupId]/join — join an open group
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { joinOpenGroup } from "@/services/group-membership-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const groupId = new URL(request.url).pathname.split("/").at(-2);
  if (!groupId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing groupId" });
  }

  const member = await joinOpenGroup(userId, groupId);

  return successResponse({ member }, undefined, 201);
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `group-join:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_JOIN,
  },
});
