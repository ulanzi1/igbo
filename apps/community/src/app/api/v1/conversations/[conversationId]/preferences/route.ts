import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import {
  isConversationMember,
  getConversationNotificationPreference,
  updateConversationNotificationPreference,
} from "@igbo/db/queries/chat-conversations";
import type { NotificationPreference } from "@igbo/db/queries/chat-conversations";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// GET   /api/v1/conversations/[conversationId]/preferences
//       → { notificationPreference: "all" | "mentions" | "muted" }
// PATCH /api/v1/conversations/[conversationId]/preferences
//       body: { notificationPreference: "all" | "mentions" | "muted" }
//       → { ok: true }

const VALID_PREFERENCES: NotificationPreference[] = ["all", "mentions", "muted"];

function extractConversationId(request: Request): string {
  // Path: /api/v1/conversations/{conversationId}/preferences
  // .at(-1) = "preferences", .at(-2) = conversationId
  return new URL(request.url).pathname.split("/").at(-2) ?? "";
}

const rateLimitConfig = {
  key: async () => {
    const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
    const { userId } = await getSession();
    return `conversation-preference:${userId}`;
  },
  ...RATE_LIMIT_PRESETS.CONVERSATION_PREFERENCE,
};

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const conversationId = extractConversationId(request);

  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({ title: "Forbidden", status: 403, detail: "Not a conversation member" });
  }

  const notificationPreference = await getConversationNotificationPreference(
    conversationId,
    userId,
  );
  return successResponse({ notificationPreference });
};

const patchHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const conversationId = extractConversationId(request);

  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({ title: "Forbidden", status: 403, detail: "Not a conversation member" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const { notificationPreference } = body as { notificationPreference?: unknown };

  if (
    typeof notificationPreference !== "string" ||
    !VALID_PREFERENCES.includes(notificationPreference as NotificationPreference)
  ) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid notificationPreference: must be 'all', 'mentions', or 'muted'",
    });
  }

  await updateConversationNotificationPreference(
    conversationId,
    userId,
    notificationPreference as NotificationPreference,
  );
  return successResponse({ ok: true });
};

export const GET = withApiHandler(getHandler, { rateLimit: rateLimitConfig });
export const PATCH = withApiHandler(patchHandler, { rateLimit: rateLimitConfig });
