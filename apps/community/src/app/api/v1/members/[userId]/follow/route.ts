import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { followUser, unfollowUser, isUserFollowing } from "@/services/follow-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// POST   /api/v1/members/[userId]/follow  → follow targetUserId
// DELETE /api/v1/members/[userId]/follow  → unfollow targetUserId
// GET    /api/v1/members/[userId]/follow  → { isFollowing: boolean }

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractTargetUserId(request: Request): string {
  // Path: /api/v1/members/{targetUserId}/follow
  // .at(-1) = "follow", .at(-2) = targetUserId
  const targetUserId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(targetUserId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
  }
  return targetUserId;
}

const rateLimitConfig = {
  key: async () => {
    const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
    const { userId } = await getSession();
    return `member-follow:${userId}`;
  },
  ...RATE_LIMIT_PRESETS.MEMBER_FOLLOW,
};

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const targetUserId = extractTargetUserId(request);

  if (targetUserId === userId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Cannot follow yourself" });
  }

  await followUser(userId, targetUserId);
  return successResponse({ ok: true });
};

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const targetUserId = extractTargetUserId(request);
  await unfollowUser(userId, targetUserId);
  return successResponse({ ok: true });
};

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const targetUserId = extractTargetUserId(request);
  const following = await isUserFollowing(userId, targetUserId);
  return successResponse({ isFollowing: following });
};

export const POST = withApiHandler(postHandler, { rateLimit: rateLimitConfig });
export const DELETE = withApiHandler(deleteHandler, { rateLimit: rateLimitConfig });
export const GET = withApiHandler(getHandler, { rateLimit: rateLimitConfig });
