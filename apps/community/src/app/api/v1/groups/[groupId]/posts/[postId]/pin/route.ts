// PATCH /api/v1/groups/[groupId]/posts/[postId]/pin — group leader pin/unpin
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getGroupMember } from "@/db/queries/groups";
import { db } from "@/db";
import { communityPosts } from "@/db/schema/community-posts";
import { and, eq, isNull } from "drizzle-orm";
import { togglePostPin } from "@/db/queries/posts";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractIds(url: string): { groupId: string; postId: string } {
  // /api/v1/groups/{groupId}/posts/{postId}/pin
  const parts = new URL(url).pathname.split("/");
  const groupId = parts.at(-4) ?? "";
  const postId = parts.at(-2) ?? "";
  if (!uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  if (!uuidRegex.test(postId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
  }
  return { groupId, postId };
}

const patchHandler = async (request: Request) => {
  const session = await requireAuthenticatedSession();
  const userId = session.userId;
  const { groupId, postId } = extractIds(request.url);

  // Verify caller is leader or creator
  const membership = await getGroupMember(groupId, userId);
  if (
    !membership ||
    membership.status !== "active" ||
    (membership.role !== "creator" && membership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can pin posts",
    });
  }

  // Verify post belongs to this group and is not deleted
  const [post] = await db
    .select({
      id: communityPosts.id,
      isPinned: communityPosts.isPinned,
      groupId: communityPosts.groupId,
    })
    .from(communityPosts)
    .where(and(eq(communityPosts.id, postId), isNull(communityPosts.deletedAt)));

  if (!post) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Post not found" });
  }

  if (post.groupId !== groupId) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Post not found in this group" });
  }

  const newPinnedState = !post.isPinned;
  await togglePostPin(postId, newPinnedState);

  return successResponse({ pinned: newPinnedState });
};

export const PATCH = withApiHandler(patchHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `group-manage:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_MANAGE,
  },
});
