import "server-only";
import { requireAdminSession } from "@/lib/admin-auth";
import { eventBus } from "@/services/event-bus";
import { ApiError } from "@/lib/api-error";
import {
  listPendingArticles,
  listPublishedArticles,
  getArticleByIdForAdmin,
  publishArticleById,
  rejectArticleById,
  toggleArticleFeature,
  type PaginatedArticleListOptions,
} from "@/db/queries/articles";

export async function listPendingArticlesForAdmin(
  request: Request,
  options: PaginatedArticleListOptions = {},
) {
  await requireAdminSession(request);
  return listPendingArticles(options);
}

export async function listPublishedArticlesForAdmin(
  request: Request,
  options: PaginatedArticleListOptions = {},
) {
  await requireAdminSession(request);
  return listPublishedArticles(options);
}

export async function approveArticle(
  request: Request,
  articleId: string,
): Promise<{ articleId: string }> {
  await requireAdminSession(request);

  const result = await publishArticleById(articleId);
  if (!result) {
    // Determine if the article exists at all
    const article = await getArticleByIdForAdmin(articleId);
    if (!article) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "Article not found" });
    }
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Article is not in pending_review status",
    });
  }

  await eventBus.emit("article.published", {
    articleId: result.id,
    authorId: result.authorId,
    title: result.title,
    slug: result.slug,
    timestamp: new Date().toISOString(),
  });

  return { articleId: result.id };
}

export async function rejectArticle(
  request: Request,
  articleId: string,
  feedback?: string | null,
): Promise<{ articleId: string }> {
  await requireAdminSession(request);

  const result = await rejectArticleById(articleId, feedback ?? null);
  if (!result) {
    const article = await getArticleByIdForAdmin(articleId);
    if (!article) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "Article not found" });
    }
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Article is not in pending_review status",
    });
  }

  await eventBus.emit("article.rejected", {
    articleId: result.id,
    authorId: result.authorId,
    title: result.title,
    feedback: feedback ?? undefined,
    timestamp: new Date().toISOString(),
  });

  return { articleId: result.id };
}

export async function featureArticle(
  request: Request,
  articleId: string,
  featured: boolean,
): Promise<{ articleId: string; isFeatured: boolean }> {
  await requireAdminSession(request);

  const result = await toggleArticleFeature(articleId, featured);
  if (!result) {
    const article = await getArticleByIdForAdmin(articleId);
    if (!article) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "Article not found" });
    }
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Article must be published to toggle featured status",
    });
  }

  return { articleId: result.id, isFeatured: featured };
}

export async function getArticlePreview(request: Request, articleId: string) {
  await requireAdminSession(request);

  const article = await getArticleByIdForAdmin(articleId);
  if (!article) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Article not found" });
  }

  return article;
}
