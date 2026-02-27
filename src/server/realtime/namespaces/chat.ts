// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Namespace, Socket } from "socket.io";
import { ROOM_USER, ROOM_CONVERSATION, CHAT_REPLAY_WINDOW_MS } from "@/config/realtime";
import { getUserConversationIds, isConversationMember } from "@/db/queries/chat-conversations";
import { getMessagesSince } from "@/db/queries/chat-messages";
import { messageService } from "@/services/message-service";

interface MessageSendPayload {
  conversationId: string;
  content: string;
  contentType?: string;
  parentMessageId?: string;
}

interface SyncRequestPayload {
  lastReceivedAt?: string;
}

/**
 * Sets up the /chat namespace handlers:
 * - Authentication middleware already applied (Story 1.15)
 * - Auto-joins conversation rooms on connect
 * - Handles message:send, message:delivered events
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
          const { conversationId, content, contentType = "text", parentMessageId } = payload ?? {};

          if (!conversationId || typeof conversationId !== "string") {
            if (typeof ack === "function") ack({ error: "Invalid conversationId" });
            return;
          }
          if (!content || typeof content !== "string" || content.trim().length === 0) {
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

          const message = await messageService.sendMessage({
            conversationId,
            senderId: userId,
            content: content.trim(),
            contentType: contentType as "text" | "rich_text" | "system",
            parentMessageId: parentMessageId ?? undefined,
          });

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

          const hasMore = missed.length === 100;
          socket.emit("sync:replay", {
            messages: missed.map((m) => ({
              messageId: m.id,
              conversationId: m.conversationId,
              senderId: m.senderId,
              content: m.content,
              contentType: m.contentType,
              createdAt: m.createdAt.toISOString(),
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
