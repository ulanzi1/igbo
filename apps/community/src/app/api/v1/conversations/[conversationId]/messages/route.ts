import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import {
  isConversationMember,
  getConversationById,
  getMemberJoinedAt,
} from "@igbo/db/queries/chat-conversations";
import { messageService } from "@/services/message-service";
import { getReactionsForMessages } from "@igbo/db/queries/chat-message-reactions";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// ── GET /api/v1/conversations/[conversationId]/messages ───────────────────────

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  // Extract conversationId from URL path (withApiHandler doesn't pass Next.js params)
  const conversationId = new URL(request.url).pathname.split("/").at(-2);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }

  // Verify conversation exists and is not soft-deleted
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Conversation not found" });
  }

  // Verify requester is a member
  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const direction = (url.searchParams.get("direction") ?? "before") as "before" | "after";

  const limitParam = url.searchParams.get("limit");
  let limit: number | undefined;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Invalid 'limit' value: must be between 1 and 100",
      });
    }
    limit = parsed;
  }

  if (!["before", "after"].includes(direction)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid 'direction': must be 'before' or 'after'",
    });
  }

  // For group conversations, enforce join-point visibility (AC4: new members only see
  // messages from when they were added, not full history)
  const joinedAt = await getMemberJoinedAt(conversationId, userId);

  const { messages, hasMore } = await messageService.getMessages(conversationId, {
    cursor,
    limit,
    direction,
    joinedAfter: joinedAt ?? undefined,
  });

  const nextCursor = hasMore && messages.length > 0 ? messages[messages.length - 1]?.id : null;

  // Batch-load reactions for this page to avoid N+1
  const messageIds = messages.map((m) => m.id);
  const allReactions = messageIds.length > 0 ? await getReactionsForMessages(messageIds) : [];

  // Group reactions by messageId
  const reactionsByMessageId = new Map<string, typeof allReactions>();
  for (const r of allReactions) {
    const list = reactionsByMessageId.get(r.messageId) ?? [];
    list.push(r);
    reactionsByMessageId.set(r.messageId, list);
  }

  // Map DB rows (id) to frontend shape (messageId) to match Socket.IO message:new payloads
  // Also include attachments (pre-loaded by MessageService.getMessages) and reactions
  const mapped = messages.map((m) => {
    // _attachments is tagged by MessageService.getMessages for non-empty results
    const msgWithAtts = m as unknown as {
      id: string;
      conversationId: string;
      senderId: string;
      content: string;
      contentType: string;
      createdAt: Date;
      parentMessageId: string | null;
      editedAt: Date | null;
      deletedAt: Date | null;
      _attachments?: Array<{
        id: string;
        fileUrl: string;
        fileName: string;
        fileType: string | null;
        fileSize: number | null;
      }>;
    };

    const reactions = (reactionsByMessageId.get(m.id) ?? []).map((r) => ({
      emoji: r.emoji,
      userId: r.userId,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      messageId: msgWithAtts.id,
      conversationId: msgWithAtts.conversationId,
      senderId: msgWithAtts.senderId,
      content: msgWithAtts.content,
      contentType: msgWithAtts.contentType,
      createdAt: msgWithAtts.createdAt.toISOString(),
      parentMessageId: msgWithAtts.parentMessageId ?? null,
      editedAt: msgWithAtts.editedAt ? msgWithAtts.editedAt.toISOString() : null,
      deletedAt: msgWithAtts.deletedAt ? msgWithAtts.deletedAt.toISOString() : null,
      attachments: (msgWithAtts._attachments ?? []).map((a) => ({
        id: a.id,
        fileUrl: a.fileUrl,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
      })),
      reactions,
    };
  });

  return successResponse({
    messages: mapped,
    meta: { cursor: nextCursor ?? null, hasMore },
  });
};

export const GET = withApiHandler(handler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `message-fetch:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MESSAGE_FETCH,
  },
});
