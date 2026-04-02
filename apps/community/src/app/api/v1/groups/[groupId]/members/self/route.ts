// DELETE /api/v1/groups/[groupId]/members/self — leave a group
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { leaveGroup } from "@/services/group-membership-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const segments = new URL(request.url).pathname.split("/");
  // .../groups/{groupId}/members/self
  const groupId = segments.at(-3);
  if (!groupId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing groupId" });
  }

  await leaveGroup(userId, groupId);

  return successResponse({ left: true });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `group-leave:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_LEAVE,
  },
});
