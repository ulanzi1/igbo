// GET /api/v1/articles/[articleId]/comments — list comments (public)
// POST /api/v1/articles/[articleId]/comments — add comment (authenticated)
import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { addComment, listComments } from "@/services/article-comment-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

function extractArticleId(url: string): string {
  const parts = new URL(url).pathname.split("/");
  // …/articles/[articleId]/comments — articleId is second-to-last segment
  return parts.at(-2) ?? "";
}

const getHandler = async (request: Request) => {
  const articleId = extractArticleId(request.url);
  const searchParams = new URL(request.url).searchParams;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

  const result = await listComments(articleId, { page, pageSize });
  return successResponse(result);
};

const postSchema = z.object({
  content: z.string().min(1).max(2000),
  parentCommentId: z.string().uuid().optional(),
});

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const articleId = extractArticleId(request.url);
  if (!articleId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing articleId" });
  }

  const body: unknown = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const { commentId } = await addComment(
    userId,
    articleId,
    parsed.data.content,
    parsed.data.parentCommentId ?? null,
  );

  return successResponse({ commentId }, undefined, 201);
};

export const GET = withApiHandler(getHandler);

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { userId } = await requireAuthenticatedSession();
      return `article-comment:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.POST_CREATE,
  },
});
