// POST /api/v1/groups/[groupId]/requests/[userId]/approve — approve a join request
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { approveJoinRequest } from "@/services/group-membership-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postHandler = async (request: Request) => {
  const { userId: leaderId } = await requireAuthenticatedSession();

  const segments = new URL(request.url).pathname.split("/");
  // .../groups/{groupId}/requests/{userId}/approve
  const groupId = segments.at(-4);
  const memberId = segments.at(-2);
  if (!groupId || !memberId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing groupId or userId" });
  }

  await approveJoinRequest(leaderId, groupId, memberId);

  return successResponse({ approved: true });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `group-approve-reject:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_APPROVE_REJECT,
  },
});
