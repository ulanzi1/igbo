// DELETE /api/v1/posts/[postId]/comments/[commentId]  → soft delete own comment
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { deleteComment } from "@/services/post-interaction-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractCommentId(url: string): string {
  // /api/v1/posts/{postId}/comments/{commentId} → .at(-1) = commentId
  const commentId = new URL(url).pathname.split("/").at(-1) ?? "";
  if (!uuidRegex.test(commentId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid comment ID" });
  }
  return commentId;
}

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const commentId = extractCommentId(request.url);
  const result = await deleteComment(commentId, userId);
  if (!result.deleted) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Comment not found or you are not the author",
    });
  }
  return successResponse({ deleted: true });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `post-comment-delete:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.POST_COMMENT_DELETE,
  },
});
