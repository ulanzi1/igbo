import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { getArticlePreview } from "@/services/article-review-service";

export const GET = withApiHandler(async (request: Request) => {
  // Extract [articleId] from URL: /api/v1/admin/articles/[articleId]
  const articleId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  const article = await getArticlePreview(request, articleId);
  return successResponse(article);
});
