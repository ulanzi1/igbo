// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Namespace, Socket } from "socket.io";
import { ROOM_USER, ROOM_CONVERSATION, CHAT_REPLAY_WINDOW_MS } from "@/config/realtime";
import { getUserConversationIds, isConversationMember } from "@/db/queries/chat-conversations";
import { getMessagesSince } from "@/db/queries/chat-messages";
import { getAttachmentsForMessages } from "@/db/queries/chat-message-attachments";
import { getReactionsForMessages } from "@/db/queries/chat-message-reactions";
import { messageService } from "@/services/message-service";

const MAX_ATTACHMENTS_PER_MESSAGE = 10;

interface MessageSendPayload {
  conversationId: string;
  content: string;
  contentType?: string;
  parentMessageId?: string;
  /** Optional file upload IDs for attachments (must be ready + owned by sender) */
  attachmentFileUploadIds?: string[];
}

interface SyncRequestPayload {
  lastReceivedAt?: string;
}

/**
 * Sets up the /chat namespace handlers:
 * - Authentication middleware already applied (Story 1.15)
 * - Auto-joins conversation rooms on connect
 * - Handles message:send (with optional attachments), message:delivered events
 * - Reconnection gap sync (replay vs full refresh)
 *
 * Block enforcement: import raw DB queries directly (no @/services/block-service)
 * — established realtime container pattern (same as notifications.ts).
 */
export function setupChatNamespace(ns: Namespace): void {
  ns.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;

    // Join personal user room so bridge can target this socket by userId
    // (needed for conversation.created / conversation.member_added events)
    void socket.join(ROOM_USER(userId));

    // Auto-join all active conversation rooms
    void autoJoinConversations(ns, socket, userId);

    // message:send — validate, persist, broadcast
    socket.on(
      "message:send",
      async (payload: MessageSendPayload, ack?: (resp: unknown) => void) => {
        try {
          const {
            conversationId,
            content,
            contentType = "text",
            parentMessageId,
            attachmentFileUploadIds,
          } = payload ?? {};

          if (!conversationId || typeof conversationId !== "string") {
            if (typeof ack === "function") ack({ error: "Invalid conversationId" });
            return;
          }

          // Validate attachment IDs if present (primary gate — MessageService also validates)
          const hasAttachments =
            Array.isArray(attachmentFileUploadIds) && attachmentFileUploadIds.length > 0;

          // Allow empty content only when attachments are present (attachment-only messages)
          if (typeof content !== "string" || (content.trim().length === 0 && !hasAttachments)) {
            if (typeof ack === "function") ack({ error: "Content is required" });
            return;
          }

          // Verify sender is a member
          const isMember = await isConversationMember(conversationId, userId);
          if (!isMember) {
            if (typeof ack === "function") ack({ error: "Not a member of this conversation" });
            return;
          }

          // Block check: get conversation members and verify none have blocked sender
          const blocked = await checkIfAnyMemberBlocked(conversationId, userId);
          if (blocked) {
            if (typeof ack === "function") ack({ error: "Cannot send message" });
            return;
          }

          if (hasAttachments) {
            if (attachmentFileUploadIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
              if (typeof ack === "function") ack({ error: "Too many attachments" });
              return;
            }

            // Validate each upload: exist, status=ready, uploader=sender
            const isValid = await validateAttachments(attachmentFileUploadIds, userId);
            if (!isValid) {
              if (typeof ack === "function")
                ack({ error: "Invalid attachment: must be ready and owned by sender" });
              return;
            }
          }

          let message;
          if (hasAttachments) {
            message = await messageService.sendMessageWithAttachments({
              conversationId,
              senderId: userId,
              content: content.trim(),
              contentType: contentType as "text" | "rich_text" | "system",
              parentMessageId: parentMessageId ?? undefined,
              attachmentFileUploadIds: attachmentFileUploadIds,
            });
          } else {
            message = await messageService.sendMessage({
              conversationId,
              senderId: userId,
              content: content.trim(),
              contentType: contentType as "text" | "rich_text" | "system",
              parentMessageId: parentMessageId ?? undefined,
            });
          }

          // message:new is emitted via EventBus bridge (message.sent → message:new)
          // Do NOT emit directly here — that would cause duplicate delivery.

          if (typeof ack === "function") ack({ messageId: message.id });
        } catch (err: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "chat.message_send.failed",
              userId,
              error: String(err),
            }),
          );
          if (typeof ack === "function") ack({ error: "Failed to send message" });
        }
      },
    );

    // message:edit — validate, call service, let EventBus bridge broadcast message:edited
    socket.on(
      "message:edit",
      async (
        payload: { messageId: string; conversationId: string; content: string },
        callback?: (resp: unknown) => void,
      ) => {
        try {
          const { messageId, conversationId, content } = payload ?? {};

          if (!conversationId || typeof conversationId !== "string") {
            if (typeof callback === "function") callback({ error: "Invalid conversationId" });
            return;
          }
          if (!messageId || typeof messageId !== "string") {
            if (typeof callback === "function") callback({ error: "Invalid messageId" });
            return;
          }
          if (!content || typeof content !== "string" || content.trim().length === 0) {
            if (typeof callback === "function") callback({ error: "Content is required" });
            return;
          }
          if (content.length > 4000) {
            if (typeof callback === "function") callback({ error: "Content too long" });
            return;
          }

          const isMember = await isConversationMember(conversationId, userId);
          if (!isMember) {
            if (typeof callback === "function")
              callback({ error: "Not a member of this conversation" });
            return;
          }

          await messageService.updateMessage(messageId, userId, content.trim());
          if (typeof callback === "function") callback({ ok: true });
        } catch (err: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "chat.message_edit.failed",
              userId,
              error: String(err),
            }),
          );
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "NOT_FOUND") {
            if (typeof callback === "function") callback({ error: "Message not found" });
          } else if (code === "FORBIDDEN") {
            if (typeof callback === "function") callback({ error: "Cannot edit this message" });
          } else if (code === "GONE") {
            if (typeof callback === "function") callback({ error: "Message has been deleted" });
          } else {
            if (typeof callback === "function") callback({ error: "Failed to edit message" });
          }
        }
      },
    );

    // message:delete — validate, call service, let EventBus bridge broadcast message:deleted
    socket.on(
      "message:delete",
      async (
        payload: { messageId: string; conversationId: string },
        callback?: (resp: unknown) => void,
      ) => {
        try {
          const { messageId, conversationId } = payload ?? {};

          if (!conversationId || typeof conversationId !== "string") {
            if (typeof callback === "function") callback({ error: "Invalid conversationId" });
            return;
          }
          if (!messageId || typeof messageId !== "string") {
            if (typeof callback === "function") callback({ error: "Invalid messageId" });
            return;
          }

          const isMember = await isConversationMember(conversationId, userId);
          if (!isMember) {
            if (typeof callback === "function")
              callback({ error: "Not a member of this conversation" });
            return;
          }

          await messageService.deleteMessage(messageId, userId);
          if (typeof callback === "function") callback({ ok: true });
        } catch (err: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "chat.message_delete.failed",
              userId,
              error: String(err),
            }),
          );
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "NOT_FOUND") {
            if (typeof callback === "function") callback({ error: "Message not found" });
          } else if (code === "FORBIDDEN") {
            if (typeof callback === "function") callback({ error: "Cannot delete this message" });
          } else if (code === "GONE") {
            if (typeof callback === "function")
              callback({ error: "Message has already been deleted" });
          } else {
            if (typeof callback === "function") callback({ error: "Failed to delete message" });
          }
        }
      },
    );

    // message:delivered — Phase 1 no-op: ACK only, no DB write (delivery tracking in Story 2.6)
    socket.on(
      "message:delivered",
      (_payload: { messageId: string }, ack?: (resp: unknown) => void) => {
        if (typeof ack === "function") ack({ ok: true });
      },
    );

    // sync:request — reconnection gap sync
    socket.on("sync:request", async (payload: SyncRequestPayload) => {
      try {
        const lastTs = payload?.lastReceivedAt ? new Date(payload.lastReceivedAt) : null;

        if (!lastTs || isNaN(lastTs.getTime())) {
          socket.emit("sync:full_refresh", { timestamp: new Date().toISOString() });
          return;
        }

        const gapMs = Date.now() - lastTs.getTime();
        if (gapMs > CHAT_REPLAY_WINDOW_MS) {
          socket.emit("sync:full_refresh", { timestamp: new Date().toISOString() });
          return;
        }

        // Replay missed messages for all user's conversations
        const conversationIds = await getUserConversationIds(userId);
        for (const conversationId of conversationIds) {
          const missed = await getMessagesSince(conversationId, lastTs, 100);
          if (missed.length === 0) continue;

          // Batch-load attachments and reactions (avoid N+1)
          const messageIds = missed.map((m) => m.id);
          const [allAttachments, allReactions] = await Promise.all([
            getAttachmentsForMessages(messageIds),
            getReactionsForMessages(messageIds),
          ]);

          const attachmentsByMsgId = new Map<string, typeof allAttachments>();
          for (const a of allAttachments) {
            const list = attachmentsByMsgId.get(a.messageId) ?? [];
            list.push(a);
            attachmentsByMsgId.set(a.messageId, list);
          }

          const reactionsByMsgId = new Map<string, typeof allReactions>();
          for (const r of allReactions) {
            const list = reactionsByMsgId.get(r.messageId) ?? [];
            list.push(r);
            reactionsByMsgId.set(r.messageId, list);
          }

          const hasMore = missed.length === 100;
          socket.emit("sync:replay", {
            messages: missed.map((m) => ({
              messageId: m.id,
              conversationId: m.conversationId,
              senderId: m.senderId,
              // Blank content for soft-deleted messages (data privacy)
              content: m.deletedAt !== null ? "" : m.content,
              contentType: m.contentType,
              createdAt: m.createdAt.toISOString(),
              parentMessageId: m.parentMessageId ?? null,
              editedAt: m.editedAt ? m.editedAt.toISOString() : null,
              deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
              attachments: (attachmentsByMsgId.get(m.id) ?? []).map((a) => ({
                id: a.id,
                fileUrl: a.fileUrl,
                fileName: a.fileName,
                fileType: a.fileType,
                fileSize: a.fileSize,
              })),
              reactions: (reactionsByMsgId.get(m.id) ?? []).map((r) => ({
                emoji: r.emoji,
                userId: r.userId,
                createdAt: r.createdAt.toISOString(),
              })),
            })),
            hasMore,
          });
        }
      } catch (err: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "chat.sync_request.failed",
            userId,
            error: String(err),
          }),
        );
        socket.emit("sync:full_refresh", { timestamp: new Date().toISOString() });
      }
    });
  });
}

async function autoJoinConversations(
  _ns: Namespace,
  socket: Socket,
  userId: string,
): Promise<void> {
  try {
    const conversationIds = await getUserConversationIds(userId);
    for (const conversationId of conversationIds) {
      await socket.join(ROOM_CONVERSATION(conversationId));
      socket.emit("conversation:joined", { conversationId });
    }
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "chat.auto_join.failed",
        userId,
        error: String(err),
      }),
    );
  }
}

/**
 * Check if any member of the conversation has blocked the sender.
 * Uses raw DB imports (established realtime container pattern).
 * Fails CLOSED on error — blocks the message if we can't verify.
 */
async function checkIfAnyMemberBlocked(conversationId: string, senderId: string): Promise<boolean> {
  try {
    const { getConversationMembers } = await import("@/db/queries/chat-conversations");
    const { getUsersWhoBlocked } = await import("@/db/queries/block-mute");

    const [members, blockerIds] = await Promise.all([
      getConversationMembers(conversationId),
      getUsersWhoBlocked(senderId),
    ]);

    if (blockerIds.length === 0) return false;

    const blockerSet = new Set(blockerIds);
    return members.some((m) => m.userId !== senderId && blockerSet.has(m.userId));
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "chat.block_check.failed",
        senderId,
        conversationId,
        error: String(err),
      }),
    );
    return true; // Fail closed — block message if we can't verify
  }
}

/**
 * Validate attachment file upload IDs: each must exist, be ready, and belong to sender.
 * This is the primary gate in the Socket.IO handler; MessageService also validates for defense-in-depth.
 */
async function validateAttachments(fileUploadIds: string[], senderId: string): Promise<boolean> {
  try {
    const { getFileUploadById } = await import("@/db/queries/file-uploads");

    for (const id of fileUploadIds) {
      const upload = await getFileUploadById(id);
      if (!upload || upload.status !== "ready" || upload.uploaderId !== senderId) {
        return false;
      }
    }
    return true;
  } catch {
    return false; // Fail closed
  }
}
