// PATCH /api/v1/posts/[postId]/pin  → admin pin/unpin post
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { db } from "@igbo/db";
import { communityPosts } from "@igbo/db/schema/community-posts";
import { eq, isNull, and } from "drizzle-orm";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { z } from "zod/v4";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schema = z.object({ isPinned: z.boolean() });

function extractPostId(url: string): string {
  // /api/v1/posts/{postId}/pin → .at(-2) = postId
  const postId = new URL(url).pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(postId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
  }
  return postId;
}

const patchHandler = async (request: Request) => {
  await requireAdminSession(request);
  const postId = extractPostId(request.url);

  const body = (await request.json()) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "isPinned boolean required",
    });
  }

  const { isPinned } = parsed.data;

  // Verify post exists and is not deleted
  const [post] = await db
    .select({ id: communityPosts.id })
    .from(communityPosts)
    .where(and(eq(communityPosts.id, postId), isNull(communityPosts.deletedAt)));

  if (!post) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Post not found" });
  }

  await db
    .update(communityPosts)
    .set({
      isPinned,
      pinnedAt: isPinned ? new Date() : null, // Set/clear pinnedAt for ordering
    })
    .where(eq(communityPosts.id, postId));

  return successResponse({ postId, isPinned });
};

export const PATCH = withApiHandler(patchHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const { requireAdminSession: getAdmin } = await import("@/lib/admin-auth");
      const { adminId } = await getAdmin(request);
      return `pin-post:${adminId}`;
    },
    ...RATE_LIMIT_PRESETS.PIN_POST,
  },
});
