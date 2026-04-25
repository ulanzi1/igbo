// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Server, Socket } from "socket.io";
import type Redis from "ioredis";
import {
  NAMESPACE_PORTAL,
  ROOM_USER,
  ROOM_CONVERSATION,
  CHAT_REPLAY_WINDOW_MS,
  REDIS_TYPING_KEY,
  TYPING_EXPIRE_SECONDS,
} from "@igbo/config/realtime";
import { isConversationMember, markConversationRead } from "@igbo/db/queries/chat-conversations";
import { getMessagesSince } from "@igbo/db/queries/chat-messages";
import { getPortalConversationIdsForUser } from "@igbo/db/queries/portal-conversations";
import { authMiddleware } from "../middleware/auth";
import { createRateLimiterMiddleware } from "../middleware/rate-limiter";

interface MessageDeliveredPayload {
  messageId: string;
  conversationId: string;
}

interface SyncRequestPayload {
  lastReceivedAt?: string;
}

/**
 * Sets up the /portal Socket.IO namespace handlers.
 *
 * Handlers:
 * - Auto-joins user's portal conversation rooms on connect
 * - message:delivered — client confirms receipt; stored in Redis SET NX; broadcasts to room
 * - sync:request — replays missed portal messages from DB within 24h window
 * - Disconnect logging
 *
 * NOTE: message:send is deferred — POST API is the sole send mechanism for this story.
 * Socket.IO is receive-only (message:new via eventbus-bridge, message:delivered, sync:request).
 */
export function setupPortalNamespace(io: Server, redis: Redis): void {
  const portalNsp = io.of(NAMESPACE_PORTAL);
  portalNsp.use(authMiddleware);
  portalNsp.use(createRateLimiterMiddleware());

  portalNsp.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;

    // Join personal user room so bridge can target this socket by userId
    void socket.join(ROOM_USER(userId));

    // Auto-join all active portal conversation rooms
    void autoJoinPortalConversations(socket, userId);

    // message:delivered — client emits on receiving message:new
    socket.on(
      "message:delivered",
      async (payload: MessageDeliveredPayload, ack?: (resp: unknown) => void) => {
        const { messageId, conversationId } = payload ?? {};
        if (
          !messageId ||
          typeof messageId !== "string" ||
          !conversationId ||
          typeof conversationId !== "string"
        ) {
          if (typeof ack === "function") ack({ error: "Invalid payload" });
          return;
        }

        const isMember = await isConversationMember(conversationId, userId, "portal");
        if (!isMember) {
          if (typeof ack === "function") ack({ error: "Not a member" });
          return;
        }

        // Write-once delivery tracking — 24h TTL
        // F5: NX ensures write-once semantics (Key Invariant #8)
        // community-scope: raw Redis keys — VD-4 trigger not yet reached
        await redis.set(`delivered:portal:${messageId}:${userId}`, "1", "EX", 86_400, "NX"); // ci-allow-redis-key

        // Broadcast to conversation room (excluding this socket / the deliverer)
        socket.to(ROOM_CONVERSATION(conversationId)).emit("message:delivered", {
          messageId,
          conversationId,
          deliveredBy: userId,
          timestamp: new Date().toISOString(),
        });

        if (typeof ack === "function") ack({ ok: true });
      },
    );

    // typing:start — store in Redis and broadcast to room (excluding sender)
    socket.on(
      "typing:start",
      async (payload: { conversationId: string }, ack?: (r: unknown) => void) => {
        try {
          const { conversationId } = payload ?? {};
          if (!conversationId || typeof conversationId !== "string") {
            if (typeof ack === "function") ack({ error: "Invalid conversationId" });
            return;
          }
          const isMember = await isConversationMember(conversationId, userId, "portal");
          if (!isMember) {
            if (typeof ack === "function") ack({ error: "Not a member" });
            return;
          }
          // Store typing state in Redis with auto-expire (idempotent SET EX — NOT NX)
          await redis.set(
            REDIS_TYPING_KEY(conversationId, userId),
            "1",
            "EX",
            TYPING_EXPIRE_SECONDS,
          );
          // Broadcast to room EXCLUDING sender
          socket.to(ROOM_CONVERSATION(conversationId)).emit("typing:start", {
            userId,
            conversationId,
            timestamp: new Date().toISOString(),
          });
          if (typeof ack === "function") ack({ ok: true });
        } catch (err: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.typing_start.failed",
              userId,
              error: String(err),
            }),
          );
          if (typeof ack === "function") ack({ error: "Internal error" });
        }
      },
    );

    // typing:stop — delete Redis key and broadcast to room (excluding sender)
    socket.on("typing:stop", async (payload: { conversationId: string }) => {
      try {
        const { conversationId } = payload ?? {};
        if (!conversationId || typeof conversationId !== "string") return;
        const isMember = await isConversationMember(conversationId, userId, "portal");
        if (!isMember) return;
        await redis.del(REDIS_TYPING_KEY(conversationId, userId));
        socket.to(ROOM_CONVERSATION(conversationId)).emit("typing:stop", {
          userId,
          conversationId,
          timestamp: new Date().toISOString(),
        });
      } catch (err: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.typing_stop.failed",
            userId,
            error: String(err),
          }),
        );
      }
    });

    // message:read — update last_read_at in DB and broadcast to ALL room members (including self)
    socket.on(
      "message:read",
      async (payload: { conversationId: string }, ack?: (r: unknown) => void) => {
        try {
          const { conversationId } = payload ?? {};
          if (!conversationId || typeof conversationId !== "string") {
            if (typeof ack === "function") ack({ error: "Invalid conversationId" });
            return;
          }
          const isMember = await isConversationMember(conversationId, userId, "portal");
          if (!isMember) {
            if (typeof ack === "function") ack({ error: "Not a member" });
            return;
          }
          const now = new Date();
          await markConversationRead(conversationId, userId);
          // Broadcast to ALL members in the room (including sender — for other tabs / unread count)
          portalNsp.to(ROOM_CONVERSATION(conversationId)).emit("message:read", {
            conversationId,
            readerId: userId,
            lastReadAt: now.toISOString(),
            timestamp: now.toISOString(),
          });
          if (typeof ack === "function") ack({ ok: true });
        } catch (err: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.message_read.failed",
              userId,
              error: String(err),
            }),
          );
          if (typeof ack === "function") ack({ error: "Internal error" });
        }
      },
    );

    // sync:request — reconnect gap catch-up
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

        // Replay missed messages for user's portal conversations only
        const conversationIds = await getPortalConversationIdsForUser(userId);
        for (const conversationId of conversationIds) {
          const missed = await getMessagesSince(conversationId, lastTs, 100);
          if (missed.length === 0) continue;

          const hasMore = missed.length === 100;
          socket.emit("sync:replay", {
            messages: missed.map((m) => ({
              messageId: m.id,
              conversationId: m.conversationId,
              senderId: m.senderId,
              content: m.deletedAt !== null ? "" : m.content,
              contentType: m.contentType,
              createdAt: m.createdAt.toISOString(),
              parentMessageId: m.parentMessageId ?? null,
              editedAt: m.editedAt ? m.editedAt.toISOString() : null,
              deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
            })),
            hasMore,
          });
        }
      } catch (err: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.sync_request.failed",
            userId,
            error: String(err),
          }),
        );
        socket.emit("sync:full_refresh", { timestamp: new Date().toISOString() });
      }
    });

    socket.on("disconnect", (reason: string) => {
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.socket.disconnected",
          userId,
          reason,
        }),
      );
    });
  });
}

async function autoJoinPortalConversations(socket: Socket, userId: string): Promise<void> {
  try {
    const conversationIds = await getPortalConversationIdsForUser(userId);
    for (const conversationId of conversationIds) {
      await socket.join(ROOM_CONVERSATION(conversationId));
      socket.emit("conversation:joined", { conversationId });
    }
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.auto_join.failed",
        userId,
        error: String(err),
      }),
    );
  }
}
