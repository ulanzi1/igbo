import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requestArticleRevision } from "@/services/article-review-service";
import { z } from "zod/v4";

const schema = z.object({
  feedback: z.string().min(1).max(1000),
});

export const POST = withApiHandler(async (request: Request) => {
  const articleId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0].message,
    });
  }
  const result = await requestArticleRevision(request, articleId, parsed.data.feedback);
  return successResponse(result);
});
