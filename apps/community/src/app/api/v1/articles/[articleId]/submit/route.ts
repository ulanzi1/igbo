// POST /api/v1/articles/[articleId]/submit — submit article for review
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { submitArticle } from "@/services/article-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const parts = new URL(request.url).pathname.split("/");
  // pathname: /api/v1/articles/[articleId]/submit
  const articleId = parts.at(-2);
  if (!articleId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing articleId" });
  }

  const { articleId: submittedId } = await submitArticle(userId, articleId);

  return successResponse({ articleId: submittedId, status: "pending_review" });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `article-submit:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.PROFILE_UPDATE,
  },
});
