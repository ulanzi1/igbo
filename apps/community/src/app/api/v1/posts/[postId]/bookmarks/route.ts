// POST   /api/v1/posts/[postId]/bookmarks  → add bookmark (idempotent)
// DELETE /api/v1/posts/[postId]/bookmarks  → remove bookmark (idempotent)
//
// POST always creates a bookmark (ON CONFLICT DO NOTHING if already exists).
// DELETE always removes a bookmark (no-op if not bookmarked).
// Both are truly idempotent and follow REST semantics.
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { addBookmark, removeBookmark } from "@/services/bookmark-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractPostId(url: string): string {
  // /api/v1/posts/{postId}/bookmarks → .at(-2) = postId
  const postId = new URL(url).pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(postId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
  }
  return postId;
}

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const postId = extractPostId(request.url);
  const result = await addBookmark(userId, postId);
  return successResponse(result);
};

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const postId = extractPostId(request.url);
  const result = await removeBookmark(userId, postId);
  return successResponse(result);
};

const rateLimitConfig = {
  key: async () => {
    const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
    const { userId } = await getSession();
    return `post-bookmark:${userId}`;
  },
  ...RATE_LIMIT_PRESETS.POST_BOOKMARK,
};

export const POST = withApiHandler(postHandler, { rateLimit: rateLimitConfig });
export const DELETE = withApiHandler(deleteHandler, { rateLimit: rateLimitConfig });
