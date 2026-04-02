import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { approveArticle } from "@/services/article-review-service";

export const POST = withApiHandler(async (request: Request) => {
  // Extract [articleId] from URL: /api/v1/admin/articles/[articleId]/publish
  const articleId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const result = await approveArticle(request, articleId);
  return successResponse(result);
});
