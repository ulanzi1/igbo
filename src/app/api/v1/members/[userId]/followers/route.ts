import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getFollowersPage } from "@/db/queries/follows";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// GET /api/v1/members/[userId]/followers  → { members: FollowListMember[], nextCursor: string | null }

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getHandler = async (request: Request) => {
  await requireAuthenticatedSession();
  const url = new URL(request.url);
  // Path: /api/v1/members/{userId}/followers — .at(-2) = userId
  const targetUserId = url.pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(targetUserId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
  }
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const parsedLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 20, 50));
  const members = await getFollowersPage(targetUserId, cursor, limit);
  const nextCursor = members.length === limit ? (members.at(-1)?.followedAt ?? null) : null;
  return successResponse({ members, nextCursor });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `follow-list:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.FOLLOW_LIST,
  },
});
