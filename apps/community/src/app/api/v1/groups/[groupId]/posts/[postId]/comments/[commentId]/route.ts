// DELETE /api/v1/groups/[groupId]/posts/[postId]/comments/[commentId] — leader/creator remove group comment
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getGroupById, getGroupMember } from "@/db/queries/groups";
import { getPostGroupId } from "@/db/queries/posts";
import { softDeleteGroupComment } from "@/db/queries/post-interactions";
import { logGroupModerationAction } from "@/services/audit-logger";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deleteHandler = async (request: Request) => {
  const { userId: moderatorId } = await requireAuthenticatedSession();

  const segments = new URL(request.url).pathname.split("/");
  // .../groups/{groupId}/posts/{postId}/comments/{commentId}
  const groupId = segments.at(-5);
  const postId = segments.at(-3);
  const commentId = segments.at(-1);

  if (!groupId || !uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  if (!postId || !uuidRegex.test(postId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
  }
  if (!commentId || !uuidRegex.test(commentId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid comment ID" });
  }

  const group = await getGroupById(groupId);
  if (!group) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }

  const membership = await getGroupMember(groupId, moderatorId);
  if (!membership || (membership.role !== "creator" && membership.role !== "leader")) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can remove group comments",
    });
  }

  // Verify post belongs to this group
  const postGroupId = await getPostGroupId(postId);
  if (postGroupId === undefined || postGroupId !== groupId) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Post not found in this group" });
  }

  const deleted = await softDeleteGroupComment(commentId, postId);
  if (!deleted) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "Comment not found in this post",
    });
  }

  await logGroupModerationAction({
    groupId,
    moderatorId,
    targetType: "comment",
    targetId: commentId,
    action: "remove_comment",
  });

  return successResponse({ deleted: true });
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
