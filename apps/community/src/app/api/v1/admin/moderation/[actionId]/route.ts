import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import {
  getModerationActionById,
  updateModerationAction,
  listModerationKeywords,
  updateModerationKeyword,
} from "@igbo/db/queries/moderation";
import { listMemberDisciplineHistory } from "@igbo/db/queries/member-discipline";
import { softDeletePostByModeration, getPostContentForModeration } from "@igbo/db/queries/posts";
import { softDeleteArticleByModeration, getArticleByIdForAdmin } from "@igbo/db/queries/articles";
import { issueWarning, issueSuspension, issueBan } from "@/services/member-discipline-service";
import { invalidateKeywordCache } from "@/services/moderation-service";
import { eventBus } from "@/services/event-bus";
import { z } from "zod/v4";
import { tiptapJsonToPlainText } from "@/features/articles/utils/tiptap-to-html";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    whitelistKeyword: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("remove"),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("dismiss"),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("warn"),
    reason: z.string().min(1),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("suspend"),
    reason: z.string().min(1),
    durationHours: z.union([z.literal(24), z.literal(168), z.literal(720)]),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("ban"),
    reason: z.string().min(1),
    notes: z.string().optional(),
    confirmed: z.literal(true),
  }),
]);

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const actionId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!UUID_RE.test(actionId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid action ID" });
  }

  const item = await getModerationActionById(actionId);
  if (!item) throw new ApiError({ title: "Not Found", status: 404 });

  // Include discipline history so admin can see prior actions before deciding
  let disciplineHistory = null;
  if (UUID_RE.test(item.contentAuthorId)) {
    disciplineHistory = await listMemberDisciplineHistory(item.contentAuthorId);
  }

  // Fetch content body for inline preview (handles soft-deleted posts)
  let contentBody: string | null = null;
  try {
    if (item.contentType === "post") {
      const raw = await getPostContentForModeration(item.contentId);
      contentBody = raw ? tiptapJsonToPlainText(raw) : null;
    } else if (item.contentType === "article") {
      const article = await getArticleByIdForAdmin(item.contentId);
      if (article) {
        contentBody = article.title + "\n\n" + tiptapJsonToPlainText(article.content ?? "");
      }
    } else if (item.contentType === "message") {
      contentBody = item.contentPreview ?? null;
    }
  } catch {
    // Content truly gone — leave as null
  }

  return successResponse({ action: item, disciplineHistory, contentBody });
});

export const PATCH = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const actionId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!UUID_RE.test(actionId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid action ID" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message,
    });
  }

  const { action } = parsed.data;

  const item = await getModerationActionById(actionId);
  if (!item) throw new ApiError({ title: "Not Found", status: 404 });

  // Prevent double-actioning: item must be pending
  if (item.status !== "pending") {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: `Item already ${item.status}`,
    });
  }

  const now = new Date();

  if (action === "approve") {
    const { whitelistKeyword } = parsed.data;
    await updateModerationAction(actionId, {
      status: "reviewed",
      moderatorId: adminId,
      visibilityOverride: "visible",
      actionedAt: now,
    });
    eventBus.emit("content.moderated", {
      contentType: item.contentType,
      contentId: item.contentId,
      contentAuthorId: item.contentAuthorId,
      action: "approve",
      moderatorId: adminId,
      timestamp: now.toISOString(),
    });
    // Optionally deactivate the matched keyword (whitelist it)
    if (whitelistKeyword && item.keywordMatched) {
      const keywords = await listModerationKeywords({ isActive: true });
      const match = keywords.find(
        (k) => k.keyword.toLowerCase() === item.keywordMatched!.toLowerCase(),
      );
      if (match) {
        await updateModerationKeyword(match.id, { isActive: false });
        await invalidateKeywordCache();
      }
    }
  } else if (action === "remove") {
    const { reason } = parsed.data;
    await updateModerationAction(actionId, {
      status: "reviewed",
      moderatorId: adminId,
      visibilityOverride: "hidden",
      actionedAt: now,
    });
    // Soft-delete the actual content so it no longer appears in feeds
    if (item.contentType === "post") {
      await softDeletePostByModeration(item.contentId);
    } else if (item.contentType === "article") {
      await softDeleteArticleByModeration(item.contentId);
    }
    // Messages are handled via realtime in eventbus-bridge (already works)
    eventBus.emit("content.moderated", {
      contentType: item.contentType,
      contentId: item.contentId,
      contentAuthorId: item.contentAuthorId,
      action: "remove",
      moderatorId: adminId,
      reason,
      contentPreview: item.contentPreview ?? null,
      timestamp: now.toISOString(),
    });
  } else if (action === "dismiss") {
    // dismiss — false positive; restore content visibility
    await updateModerationAction(actionId, {
      status: "dismissed",
      moderatorId: adminId,
      visibilityOverride: "visible",
      actionedAt: now,
    });
    eventBus.emit("content.moderated", {
      contentType: item.contentType,
      contentId: item.contentId,
      contentAuthorId: item.contentAuthorId,
      action: "dismiss",
      moderatorId: adminId,
      timestamp: now.toISOString(),
    });
  } else if (action === "warn") {
    const { reason, notes } = parsed.data;
    // content_author_id may not be a valid UUID for non-member content
    const targetUserId = item.contentAuthorId;
    if (!UUID_RE.test(targetUserId)) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Cannot issue discipline: content author is not a member",
      });
    }
    await issueWarning({
      targetUserId,
      moderationActionId: actionId,
      adminId,
      reason,
      notes: notes ?? null,
    });
    await updateModerationAction(actionId, {
      status: "reviewed",
      moderatorId: adminId,
      visibilityOverride: "hidden",
      actionedAt: now,
    });
    // Soft-delete the flagged content
    if (item.contentType === "post") {
      await softDeletePostByModeration(item.contentId);
    } else if (item.contentType === "article") {
      await softDeleteArticleByModeration(item.contentId);
    }
  } else if (action === "suspend") {
    const { reason, durationHours, notes } = parsed.data;
    const targetUserId = item.contentAuthorId;
    if (!UUID_RE.test(targetUserId)) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Cannot issue discipline: content author is not a member",
      });
    }
    await issueSuspension({
      targetUserId,
      moderationActionId: actionId,
      adminId,
      reason,
      durationHours,
      notes: notes ?? null,
    });
    await updateModerationAction(actionId, {
      status: "reviewed",
      moderatorId: adminId,
      visibilityOverride: "hidden",
      actionedAt: now,
    });
    // Soft-delete the flagged content
    if (item.contentType === "post") {
      await softDeletePostByModeration(item.contentId);
    } else if (item.contentType === "article") {
      await softDeleteArticleByModeration(item.contentId);
    }
  } else if (action === "ban") {
    const { reason, notes } = parsed.data;
    const targetUserId = item.contentAuthorId;
    if (!UUID_RE.test(targetUserId)) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Cannot issue discipline: content author is not a member",
      });
    }
    await issueBan({
      targetUserId,
      moderationActionId: actionId,
      adminId,
      reason,
      notes: notes ?? null,
    });
    await updateModerationAction(actionId, {
      status: "reviewed",
      moderatorId: adminId,
      visibilityOverride: "hidden",
      actionedAt: now,
    });
    // Soft-delete the flagged content
    if (item.contentType === "post") {
      await softDeletePostByModeration(item.contentId);
    } else if (item.contentType === "article") {
      await softDeleteArticleByModeration(item.contentId);
    }
  }

  const updated = await getModerationActionById(actionId);
  // Include discipline history for the target user if available
  let disciplineHistory = null;
  if (updated && UUID_RE.test(updated.contentAuthorId)) {
    disciplineHistory = await listMemberDisciplineHistory(updated.contentAuthorId);
  }
  return successResponse({ action: updated, disciplineHistory });
});
