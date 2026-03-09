import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  getModerationActionById,
  updateModerationAction,
  listModerationKeywords,
  updateModerationKeyword,
} from "@/db/queries/moderation";
import { eventBus } from "@/services/event-bus";
import { z } from "zod/v4";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  action: z.enum(["approve", "remove", "dismiss"]),
  reason: z.string().optional(),
  whitelistKeyword: z.boolean().optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const actionId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!UUID_RE.test(actionId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid action ID" });
  }

  const item = await getModerationActionById(actionId);
  if (!item) throw new ApiError({ title: "Not Found", status: 404 });

  return successResponse({ action: item });
});

export const PATCH = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const actionId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!UUID_RE.test(actionId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid action ID" });
  }

  const body = (await request.json()) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message,
    });
  }

  const { action, reason, whitelistKeyword } = parsed.data;

  const item = await getModerationActionById(actionId);
  if (!item) throw new ApiError({ title: "Not Found", status: 404 });

  const now = new Date();

  if (action === "approve") {
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
      }
    }
  } else if (action === "remove") {
    await updateModerationAction(actionId, {
      status: "reviewed",
      moderatorId: adminId,
      visibilityOverride: "hidden",
      actionedAt: now,
    });
    eventBus.emit("content.moderated", {
      contentType: item.contentType,
      contentId: item.contentId,
      contentAuthorId: item.contentAuthorId,
      action: "remove",
      moderatorId: adminId,
      reason,
      timestamp: now.toISOString(),
    });
  } else {
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
  }

  const updated = await getModerationActionById(actionId);
  return successResponse({ action: updated });
});
