import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { getModerationActionById } from "@igbo/db/queries/moderation";
import { getMessageById, getConversationMessages } from "@igbo/db/queries/chat-messages";
import { logAdminAction } from "@/services/audit-logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// How many messages to fetch before and after the flagged message
const CONTEXT_WINDOW = 10;

export const GET = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  // Extract actionId from URL: /api/v1/admin/moderation/[actionId]/conversation
  const parts = new URL(request.url).pathname.split("/");
  const actionId = parts.at(-2) ?? "";

  if (!UUID_RE.test(actionId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid action ID" });
  }

  const item = await getModerationActionById(actionId);
  if (!item) throw new ApiError({ title: "Not Found", status: 404 });

  // Only message-type items can be reviewed in conversation context
  if (item.contentType !== "message") {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Conversation review is only available for message-type moderation items",
    });
  }

  const messageId = item.contentId;
  if (!UUID_RE.test(messageId)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid message ID in moderation action",
    });
  }

  // Fetch the flagged message
  const flaggedMessage = await getMessageById(messageId);
  if (!flaggedMessage) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Flagged message not found" });
  }

  const { conversationId } = flaggedMessage;

  // Fetch bounded context window: messages before and after the flagged message
  const [beforeResult, afterResult] = await Promise.all([
    getConversationMessages(conversationId, {
      cursor: messageId,
      limit: CONTEXT_WINDOW,
      direction: "before",
    }),
    getConversationMessages(conversationId, {
      cursor: messageId,
      limit: CONTEXT_WINDOW,
      direction: "after",
    }),
  ]);

  // Log every dispute view for audit trail — IDs only, no PII
  await logAdminAction({
    actorId: adminId,
    action: "VIEW_DISPUTE_CONVERSATION",
    targetUserId: item.contentAuthorId,
    details: {
      moderationActionId: actionId,
      conversationId,
      messageId,
    },
  });

  return successResponse({
    flaggedMessage,
    conversationId,
    contextBefore: beforeResult.messages,
    contextAfter: afterResult.messages,
  });
});
