// DELETE /api/v1/groups/[groupId]/archive — archive a group (creator or admin only)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { archiveGroup } from "@/services/group-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deleteHandler = async (request: Request) => {
  const { userId: actorId } = await requireAuthenticatedSession();

  const segments = new URL(request.url).pathname.split("/");
  // .../groups/{groupId}/archive
  const groupId = segments.at(-2);

  if (!groupId || !uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }

  await archiveGroup(actorId, groupId);

  return successResponse({ archived: true });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `group-manage:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_MANAGE,
  },
});
