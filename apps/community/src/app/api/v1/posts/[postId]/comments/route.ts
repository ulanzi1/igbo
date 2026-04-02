// GET  /api/v1/posts/[postId]/comments  → paginated comments list
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getPostComments } from "@/services/post-interaction-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractPostId(url: string): string {
  // /api/v1/posts/{postId}/comments → .at(-2) = postId
  const postId = new URL(url).pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(postId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
  }
  return postId;
}

const getHandler = async (request: Request) => {
  await requireAuthenticatedSession();
  const postId = extractPostId(request.url);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 50);

  const result = await getPostComments(postId, { cursor, limit });
  return successResponse(result);
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `post-comments-read:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.POST_COMMENTS_READ,
  },
});
