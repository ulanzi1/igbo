import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { featureArticle } from "@/services/article-review-service";
import { z } from "zod/v4";

const schema = z.object({
  featured: z.boolean(),
});

export const PATCH = withApiHandler(async (request: Request) => {
  // Extract [articleId] from URL: /api/v1/admin/articles/[articleId]/feature
  const articleId = new URL(request.url).pathname.split("/").at(-2) ?? "";

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error?.issues[0]?.message ?? "Invalid input",
    });
  }

  const result = await featureArticle(request, articleId, parsed.data.featured);
  return successResponse(result);
});
