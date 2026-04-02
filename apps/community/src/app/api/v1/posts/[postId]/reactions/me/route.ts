// GET /api/v1/posts/[postId]/reactions/me  → viewer's current reaction
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getViewerReaction, getReactionCounts } from "@igbo/db/queries/post-interactions";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractPostId(url: string): string {
  // /api/v1/posts/{postId}/reactions/me → .at(-3) = postId
  const postId = new URL(url).pathname.split("/").at(-3) ?? "";
  if (!uuidRegex.test(postId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
  }
  return postId;
}

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const postId = extractPostId(request.url);
  const [userReaction, counts] = await Promise.all([
    getViewerReaction(postId, userId),
    getReactionCounts(postId),
  ]);
  return successResponse({ userReaction, counts });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `post-reactions-read:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.POST_REACTIONS_READ,
  },
});
