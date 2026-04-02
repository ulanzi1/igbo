import "server-only";
import { ApiError } from "@/lib/api-error";
import { eventBus } from "@/services/event-bus";
import { addArticleComment, listArticleComments } from "@/db/queries/article-comments";
import type { ArticleCommentItem } from "@/db/queries/article-comments";
import { getArticleByIdForAdmin } from "@/db/queries/articles";

export async function addComment(
  userId: string,
  articleId: string,
  content: string,
  parentCommentId?: string | null,
): Promise<{ commentId: string }> {
  if (!userId) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }

  if (!content.trim() || content.length > 2000) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: content.trim()
        ? "Comment must be 2000 characters or fewer"
        : "Comment cannot be empty",
    });
  }

  const article = await getArticleByIdForAdmin(articleId);
  if (!article || article.status !== "published") {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "Article not found or not published",
    });
  }

  const comment = await addArticleComment({
    articleId,
    authorId: userId,
    content: content.trim(),
    parentCommentId: parentCommentId ?? null,
  });

  await eventBus.emit("article.commented", {
    articleId,
    commentId: comment.id,
    userId,
    timestamp: new Date().toISOString(),
  });

  return { commentId: comment.id };
}

export async function listComments(
  articleId: string,
  opts?: { page?: number; pageSize?: number },
): Promise<{ items: ArticleCommentItem[]; total: number }> {
  return listArticleComments(articleId, opts);
}
