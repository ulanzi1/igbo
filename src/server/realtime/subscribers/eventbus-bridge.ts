// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type Redis from "ioredis";
import type { Server } from "socket.io";
import {
  ROOM_USER,
  ROOM_CONVERSATION,
  NAMESPACE_NOTIFICATIONS,
  NAMESPACE_CHAT,
} from "@/config/realtime";
import type {
  NotificationCreatedEvent,
  NotificationReadEvent,
  MessageSentEvent,
} from "@/types/events";

const CHANNEL_PREFIX = "eventbus:";

/**
 * Subscribes to the `eventbus:*` Redis pub/sub channel and forwards
 * relevant events to the appropriate Socket.IO namespace/rooms.
 *
 * Pattern reference: src/services/event-bus-subscriber.ts (web container)
 * This is the realtime-container counterpart — instead of re-emitting on
 * the in-process EventBus, we route directly to Socket.IO namespace rooms.
 */
export async function startEventBusBridge(io: Server, subscriber: Redis): Promise<void> {
  subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const eventName = channel.slice(CHANNEL_PREFIX.length);
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch {
      return; // Malformed message — skip
    }

    routeToNamespace(io, eventName, payload);
  });

  await subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
}

export async function stopEventBusBridge(subscriber: Redis): Promise<void> {
  await subscriber.punsubscribe(`${CHANNEL_PREFIX}*`);
}

function routeToNamespace(io: Server, eventName: string, payload: unknown): void {
  const notificationsNs = io.of(NAMESPACE_NOTIFICATIONS);
  const chatNs = io.of(NAMESPACE_CHAT);

  switch (eventName) {
    case "notification.created": {
      const notifPayload = payload as NotificationCreatedEvent;
      if (!notifPayload?.userId) break;
      // Emit full notification shape matching PlatformNotification for client cache update
      notificationsNs.to(ROOM_USER(notifPayload.userId)).emit("notification:new", {
        id: notifPayload.notificationId,
        userId: notifPayload.userId,
        type: notifPayload.type,
        title: notifPayload.title,
        body: notifPayload.body,
        link: notifPayload.link ?? null,
        isRead: false,
        createdAt: notifPayload.timestamp,
      });
      // Also send unread count update (client will increment)
      notificationsNs.to(ROOM_USER(notifPayload.userId)).emit("unread:update", {
        userId: notifPayload.userId,
        increment: 1,
        timestamp: notifPayload.timestamp,
      });
      break;
    }
    case "notification.read": {
      const readPayload = payload as NotificationReadEvent;
      if (!readPayload?.userId) break;
      // Notify client to update read state (multi-tab/device sync)
      notificationsNs.to(ROOM_USER(readPayload.userId)).emit("notification:read", {
        notificationId: readPayload.notificationId,
        timestamp: readPayload.timestamp,
      });
      break;
    }
    case "message.sent": {
      const msgPayload = payload as MessageSentEvent;
      if (!msgPayload?.conversationId) break;
      chatNs.to(ROOM_CONVERSATION(msgPayload.conversationId)).emit("message:new", {
        messageId: msgPayload.messageId,
        conversationId: msgPayload.conversationId,
        senderId: msgPayload.senderId,
        content: msgPayload.content,
        contentType: msgPayload.contentType,
        createdAt: msgPayload.createdAt,
      });
      break;
    }
    default:
      // Other events not routed in this story
      break;
  }
}
