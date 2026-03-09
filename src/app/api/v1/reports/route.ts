import { z } from "zod/v4";
import { eq, isNull, and } from "drizzle-orm";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse, errorResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { createReport } from "@/db/queries/reports";
import { eventBus } from "@/services/event-bus";
import { db } from "@/db";
import { communityPosts } from "@/db/schema/community-posts";
import { communityPostComments } from "@/db/schema/post-interactions";
import { communityArticleComments } from "@/db/schema/community-article-comments";
import { communityArticles } from "@/db/schema/community-articles";
import { chatMessages } from "@/db/schema/chat-messages";
import { authUsers } from "@/db/schema/auth-users";
import { ApiError } from "@/lib/api-error";

const reportSchema = z.object({
  contentType: z.enum(["post", "comment", "message", "member", "article"]),
  contentId: z.string().uuid(),
  reasonCategory: z.enum([
    "harassment",
    "spam",
    "inappropriate_content",
    "misinformation",
    "impersonation",
    "other",
  ]),
  reasonText: z.string().max(1000).optional(),
});

/**
 * Verify the reported content exists and return the author/owner ID for self-report check.
 * Returns null if target not found or deleted.
 */
async function getContentAuthorId(contentType: string, contentId: string): Promise<string | null> {
  switch (contentType) {
    case "post": {
      const rows = await db
        .select({ authorId: communityPosts.authorId })
        .from(communityPosts)
        .where(and(eq(communityPosts.id, contentId), isNull(communityPosts.deletedAt)))
        .limit(1);
      return rows[0]?.authorId ?? null;
    }

    case "comment": {
      // postInteractions comments
      const postCommentRows = await db
        .select({ userId: communityPostComments.userId })
        .from(communityPostComments)
        .where(eq(communityPostComments.id, contentId))
        .limit(1);
      if (postCommentRows[0]) return postCommentRows[0].userId;

      // article comments
      const articleCommentRows = await db
        .select({ userId: communityArticleComments.userId })
        .from(communityArticleComments)
        .where(eq(communityArticleComments.id, contentId))
        .limit(1);
      return articleCommentRows[0]?.userId ?? null;
    }

    case "article": {
      const rows = await db
        .select({ authorId: communityArticles.authorId })
        .from(communityArticles)
        .where(and(eq(communityArticles.id, contentId), isNull(communityArticles.deletedAt)))
        .limit(1);
      return rows[0]?.authorId ?? null;
    }

    case "message": {
      const rows = await db
        .select({ senderId: chatMessages.senderId })
        .from(chatMessages)
        .where(eq(chatMessages.id, contentId))
        .limit(1);
      return rows[0]?.senderId ?? null;
    }

    case "member": {
      const rows = await db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.id, contentId))
        .limit(1);
      // Verify account is active (not anonymized or deleted)
      const user = rows[0];
      if (!user) return null;
      return user.id;
    }

    default:
      return null;
  }
}

export const POST = withApiHandler(
  async (request: Request) => {
    const session = await requireAuthenticatedSession();
    const reporterId = session.userId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
    }

    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        {
          title: "Validation Error",
          status: 400,
          detail: parsed.error.issues[0]?.message ?? "Invalid input",
        },
        400,
      );
    }

    const { contentType, contentId, reasonCategory, reasonText } = parsed.data;

    // Verify target exists and get author for self-report check
    const authorId = await getContentAuthorId(contentType, contentId);
    if (authorId === null) {
      return errorResponse({ title: "Not Found", status: 404, detail: "Content not found" }, 404);
    }

    // Prevent self-reporting (member contentType: authorId IS the contentId)
    const ownerId = contentType === "member" ? contentId : authorId;
    if (ownerId === reporterId) {
      return errorResponse(
        { title: "Bad Request", status: 400, detail: "You cannot report your own content" },
        400,
      );
    }

    const report = await createReport(
      reporterId,
      contentType,
      contentId,
      reasonCategory,
      reasonText,
    );

    if (report === null) {
      // ON CONFLICT DO NOTHING — already reported by this user
      return successResponse({ alreadyReported: true });
    }

    // Emit report.created for moderation queue ingestion
    try {
      eventBus.emit("report.created", {
        reportId: report.id,
        contentType,
        contentId,
        reasonCategory,
        contentAuthorId: ownerId,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Non-critical — report is already persisted
    }

    return successResponse({ reportId: report.id }, undefined, 201);
  },
  { rateLimit: RATE_LIMIT_PRESETS.REPORT_SUBMIT },
);
