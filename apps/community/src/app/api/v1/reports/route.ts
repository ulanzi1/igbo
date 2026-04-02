import { z } from "zod/v4";
import { eq, isNull, and } from "drizzle-orm";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse, errorResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { createReport, countReporterReportsLast24h } from "@igbo/db/queries/reports";
import { eventBus } from "@/services/event-bus";
import { db } from "@igbo/db";
import { communityPosts } from "@igbo/db/schema/community-posts";
import { communityPostComments } from "@igbo/db/schema/post-interactions";
import { communityArticleComments } from "@igbo/db/schema/community-article-comments";
import { communityArticles } from "@igbo/db/schema/community-articles";
import { chatMessages } from "@igbo/db/schema/chat-messages";
import { authUsers } from "@igbo/db/schema/auth-users";
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
        .select({ authorId: communityPostComments.authorId })
        .from(communityPostComments)
        .where(eq(communityPostComments.id, contentId))
        .limit(1);
      if (postCommentRows[0]) return postCommentRows[0].authorId;

      // article comments
      const articleCommentRows = await db
        .select({ authorId: communityArticleComments.authorId })
        .from(communityArticleComments)
        .where(eq(communityArticleComments.id, contentId))
        .limit(1);
      return articleCommentRows[0]?.authorId ?? null;
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

const rateLimitConfig = {
  key: async () => {
    const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
    const { userId } = await getSession();
    return `report-submit:${userId}`;
  },
  ...RATE_LIMIT_PRESETS.REPORT_SUBMIT,
};

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
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const { contentType, contentId, reasonCategory, reasonText } = parsed.data;

    // Verify target exists and get author for self-report check
    const authorId = await getContentAuthorId(contentType, contentId);
    if (authorId === null) {
      return errorResponse({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "Content not found",
      });
    }

    // Prevent self-reporting (member contentType: authorId IS the contentId)
    const ownerId = contentType === "member" ? contentId : authorId;
    if (ownerId === reporterId) {
      return errorResponse({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        detail: "You cannot report your own content",
      });
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

    // Check for repeated-reporting abuse pattern (>= 3 reports in 24h)
    let warning: string | undefined;
    try {
      const recentCount = await countReporterReportsLast24h(reporterId);
      if (recentCount >= 3) warning = "repeated_reporting";
    } catch {
      // Non-critical — don't block report submission
    }

    return successResponse(
      { reportId: report.id, ...(warning ? { warning } : {}) },
      undefined,
      201,
    );
  },
  { rateLimit: rateLimitConfig },
);
