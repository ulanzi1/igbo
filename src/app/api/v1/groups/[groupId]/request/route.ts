// POST /api/v1/groups/[groupId]/request — request to join a private group
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { requestToJoinGroup } from "@/services/group-membership-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const groupId = new URL(request.url).pathname.split("/").at(-2);
  if (!groupId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing groupId" });
  }

  const result = await requestToJoinGroup(userId, groupId);

  return successResponse(result, undefined, 201);
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `group-request:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_REQUEST,
  },
});
