// POST /api/v1/articles/[articleId]/view — increment view count (public, no auth)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { incrementArticleViewCount } from "@igbo/db/queries/articles";

const postHandler = async (request: Request) => {
  const parts = new URL(request.url).pathname.split("/");
  // …/articles/[articleId]/view — articleId is second-to-last segment
  const articleId = parts.at(-2) ?? "";

  try {
    await incrementArticleViewCount(articleId);
  } catch {
    // Swallow error — view tracking is non-critical; do not fail the request
  }

  return successResponse({ ok: true });
};

export const POST = withApiHandler(postHandler);
