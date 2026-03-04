// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type Redis from "ioredis";
import type { Server } from "socket.io";
import {
  ROOM_USER,
  ROOM_CONVERSATION,
  NAMESPACE_NOTIFICATIONS,
  NAMESPACE_CHAT,
} from "@/config/realtime";
import { listGroupChannels } from "@/db/queries/group-channels";
import type {
  NotificationCreatedEvent,
  NotificationReadEvent,
  MessageSentEvent,
  MessageEditedEvent,
  MessageDeletedEvent,
  MessageMentionedEvent,
  ConversationCreatedEvent,
  ConversationMemberAddedEvent,
  ConversationMemberLeftEvent,
  ReactionAddedEvent,
  ReactionRemovedEvent,
  GroupMemberJoinedEvent,
  GroupMemberLeftEvent,
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
        parentMessageId: msgPayload.parentMessageId ?? null,
        attachments: msgPayload.attachments ?? [],
        reactions: [],
      });
      break;
    }
    case "message.edited": {
      const editedPayload = payload as MessageEditedEvent;
      if (!editedPayload?.conversationId || !editedPayload?.messageId) break;
      chatNs.to(ROOM_CONVERSATION(editedPayload.conversationId)).emit("message:edited", {
        messageId: editedPayload.messageId,
        conversationId: editedPayload.conversationId,
        content: editedPayload.content,
        editedAt: editedPayload.editedAt,
        senderId: editedPayload.senderId,
        timestamp: editedPayload.timestamp,
      });
      break;
    }
    case "message.deleted": {
      const deletedPayload = payload as MessageDeletedEvent;
      if (!deletedPayload?.conversationId || !deletedPayload?.messageId) break;
      chatNs.to(ROOM_CONVERSATION(deletedPayload.conversationId)).emit("message:deleted", {
        messageId: deletedPayload.messageId,
        conversationId: deletedPayload.conversationId,
        senderId: deletedPayload.senderId,
        timestamp: deletedPayload.timestamp,
      });
      break;
    }
    case "message.mentioned": {
      const mentionedPayload = payload as MessageMentionedEvent;
      if (!mentionedPayload?.mentionedUserIds?.length) break;
      for (const mentionedUserId of mentionedPayload.mentionedUserIds) {
        notificationsNs.to(ROOM_USER(mentionedUserId)).emit("mention:received", {
          messageId: mentionedPayload.messageId,
          conversationId: mentionedPayload.conversationId,
          senderId: mentionedPayload.senderId,
          contentPreview: mentionedPayload.contentPreview,
          timestamp: mentionedPayload.timestamp,
        });
      }
      break;
    }
    case "reaction.added": {
      const reactionPayload = payload as ReactionAddedEvent;
      if (!reactionPayload?.conversationId || !reactionPayload?.messageId) break;
      chatNs.to(ROOM_CONVERSATION(reactionPayload.conversationId)).emit("reaction:added", {
        messageId: reactionPayload.messageId,
        conversationId: reactionPayload.conversationId,
        userId: reactionPayload.userId,
        emoji: reactionPayload.emoji,
        action: "added",
      });
      break;
    }
    case "reaction.removed": {
      const reactionPayload = payload as ReactionRemovedEvent;
      if (!reactionPayload?.conversationId || !reactionPayload?.messageId) break;
      chatNs.to(ROOM_CONVERSATION(reactionPayload.conversationId)).emit("reaction:removed", {
        messageId: reactionPayload.messageId,
        conversationId: reactionPayload.conversationId,
        userId: reactionPayload.userId,
        emoji: reactionPayload.emoji,
        action: "removed",
      });
      break;
    }
    case "conversation.created": {
      const convPayload = payload as ConversationCreatedEvent;
      if (!convPayload?.conversationId || !Array.isArray(convPayload.memberIds)) break;
      const room = ROOM_CONVERSATION(convPayload.conversationId);
      // Make all connected sockets for each member join the new conversation room
      for (const memberId of convPayload.memberIds) {
        chatNs.in(ROOM_USER(memberId)).socketsJoin(room);
        chatNs.to(ROOM_USER(memberId)).emit("conversation:created", {
          conversationId: convPayload.conversationId,
          type: convPayload.type,
        });
      }
      break;
    }
    case "conversation.member_added": {
      const addedPayload = payload as ConversationMemberAddedEvent;
      if (!addedPayload?.conversationId || !addedPayload?.newUserId) break;
      const room = ROOM_CONVERSATION(addedPayload.conversationId);
      // Join new member's sockets to the conversation room
      chatNs.in(ROOM_USER(addedPayload.newUserId)).socketsJoin(room);
      // Notify new member they've been added
      chatNs.to(ROOM_USER(addedPayload.newUserId)).emit("conversation:created", {
        conversationId: addedPayload.conversationId,
        type: "group",
      });
      // Notify the conversation room of the new member
      chatNs.to(room).emit("conversation:member_added", {
        conversationId: addedPayload.conversationId,
        newUserId: addedPayload.newUserId,
        addedByUserId: addedPayload.addedByUserId,
      });
      break;
    }
    case "conversation.member_left": {
      const leftPayload = payload as ConversationMemberLeftEvent;
      if (!leftPayload?.conversationId || !leftPayload?.userId) break;
      const room = ROOM_CONVERSATION(leftPayload.conversationId);
      // Notify the conversation room of the member leaving
      chatNs.to(room).emit("conversation:member_left", {
        conversationId: leftPayload.conversationId,
        userId: leftPayload.userId,
      });
      // Make the leaving member's sockets leave the room
      chatNs.in(ROOM_USER(leftPayload.userId)).socketsLeave(room);
      break;
    }
    case "group.member_joined": {
      const joinPayload = payload as GroupMemberJoinedEvent;
      if (!joinPayload?.groupId || !joinPayload?.userId) break;
      // Join member's sockets to all group channel conversation rooms
      void (async () => {
        try {
          const channels = await listGroupChannels(joinPayload.groupId);
          for (const channel of channels) {
            const room = ROOM_CONVERSATION(channel.conversationId);
            chatNs.in(ROOM_USER(joinPayload.userId)).socketsJoin(room);
          }
        } catch {
          // Non-critical — socket room join failure should not throw
        }
      })();
      break;
    }
    case "group.member_left": {
      const leftGroupPayload = payload as GroupMemberLeftEvent;
      if (!leftGroupPayload?.groupId || !leftGroupPayload?.userId) break;
      // Remove member's sockets from all group channel conversation rooms
      void (async () => {
        try {
          const channels = await listGroupChannels(leftGroupPayload.groupId);
          for (const channel of channels) {
            const room = ROOM_CONVERSATION(channel.conversationId);
            chatNs.in(ROOM_USER(leftGroupPayload.userId)).socketsLeave(room);
          }
        } catch {
          // Non-critical
        }
      })();
      break;
    }
    default:
      // Other events not routed in this story
      break;
  }
}
