import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { isConversationMember, getConversationById } from "@igbo/db/queries/chat-conversations";
import { getMessageById } from "@igbo/db/queries/chat-messages";
import { isBlocked } from "@igbo/db/queries/block-mute";
import { messageService } from "@/services/message-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { z } from "zod/v4";

// URL parsing: /api/v1/conversations/{4}/messages/{6}/reactions
// Index from split("/"): 0="", 1="api", 2="v1", 3="conversations", 4=conversationId,
//                        5="messages", 6=messageId, 7="reactions"
function extractIds(url: string): {
  conversationId: string | undefined;
  messageId: string | undefined;
} {
  const parts = new URL(url).pathname.split("/");
  return {
    conversationId: parts[4],
    messageId: parts[6],
  };
}

const reactionBodySchema = z.object({
  emoji: z.string().min(1).max(32),
});

// ── POST /api/v1/conversations/[conversationId]/messages/[messageId]/reactions ─

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const { conversationId, messageId } = extractIds(request.url);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }
  if (!messageId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing messageId" });
  }

  // Verify conversation exists
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Conversation not found" });
  }

  // Verify requester is a member
  const isMember = await isConversationMember(conversationId, userId, "community");
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  // Verify message exists and belongs to this conversation
  const message = await getMessageById(messageId);
  if (!message) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Message not found" });
  }
  if (message.conversationId !== conversationId) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Message does not belong to this conversation",
    });
  }

  // Bidirectional block check: message author blocked reactor OR reactor blocked message author
  const messageAuthorId = message.senderId;
  const [authorBlockedReactor, reactorBlockedAuthor] = await Promise.all([
    isBlocked(messageAuthorId, userId),
    isBlocked(userId, messageAuthorId),
  ]);
  if (authorBlockedReactor || reactorBlockedAuthor) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Cannot react to this message",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = reactionBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid emoji",
    });
  }

  const { emoji } = parsed.data;

  const result = await messageService.addReaction(messageId, userId, emoji, conversationId);

  return successResponse({
    added: result !== null,
    messageId,
    emoji,
  });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `message-reaction:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MESSAGE_REACTION,
  },
});

// ── DELETE /api/v1/conversations/[conversationId]/messages/[messageId]/reactions ─

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const { conversationId, messageId } = extractIds(request.url);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }
  if (!messageId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing messageId" });
  }

  // Verify conversation exists and requester is a member
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Conversation not found" });
  }

  const isMember = await isConversationMember(conversationId, userId, "community");
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  // Verify message exists and belongs to this conversation
  const message = await getMessageById(messageId);
  if (!message) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Message not found" });
  }
  if (message.conversationId !== conversationId) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Message does not belong to this conversation",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = reactionBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid emoji",
    });
  }

  const { emoji } = parsed.data;

  const removed = await messageService.removeReaction(messageId, userId, emoji, conversationId);

  return successResponse({
    removed,
    messageId,
    emoji,
  });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `message-reaction:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MESSAGE_REACTION,
  },
});
