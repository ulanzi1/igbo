// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type Redis from "ioredis";
import type { Server } from "socket.io";
import {
  ROOM_USER,
  ROOM_CONVERSATION,
  ROOM_EVENT,
  NAMESPACE_NOTIFICATIONS,
  NAMESPACE_CHAT,
  NAMESPACE_PORTAL,
} from "@igbo/config/realtime";
import { db } from "@igbo/db";
import { chatMessages } from "@igbo/db/schema/chat-messages";
import { eq } from "drizzle-orm";
import { listGroupChannels } from "@igbo/db/queries/group-channels";
import { createNotification } from "@igbo/db/queries/notifications";
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
  EventRsvpEvent,
  EventRsvpCancelledEvent,
  EventAttendedEvent,
  ContentFlaggedEvent,
  ContentModeratedEvent,
} from "@/types/events";
import type {
  PortalMessageSentEvent,
  PortalMessageEditedEvent,
  PortalMessageDeletedEvent,
} from "@igbo/config/events";

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
  const portalNs = io.of(NAMESPACE_PORTAL);

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
    // Convention: {app}.{domain}.{action} — community uses chat.*, portal uses portal.*
    case "chat.message.sent": {
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
    case "chat.message.edited": {
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
    case "chat.message.deleted": {
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
    case "chat.message.mentioned": {
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
    case "chat.reaction.added": {
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
    case "chat.reaction.removed": {
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
    case "event.rsvp": {
      const rsvpPayload = payload as EventRsvpEvent;
      if (!rsvpPayload?.eventId) break;
      // Emit attendee count update to all clients viewing this event
      notificationsNs.to(ROOM_EVENT(rsvpPayload.eventId)).emit("event:attendee_update", {
        eventId: rsvpPayload.eventId,
        attendeeCount: rsvpPayload.attendeeCount,
        timestamp: rsvpPayload.timestamp,
      });
      break;
    }
    case "event.rsvp_cancelled": {
      const cancelledPayload = payload as EventRsvpCancelledEvent;
      if (!cancelledPayload?.eventId) break;
      notificationsNs.to(ROOM_EVENT(cancelledPayload.eventId)).emit("event:attendee_update", {
        eventId: cancelledPayload.eventId,
        attendeeCount: cancelledPayload.attendeeCount,
        timestamp: cancelledPayload.timestamp,
      });
      break;
    }
    case "event.attended": {
      const attendedPayload = payload as EventAttendedEvent;
      if (!attendedPayload?.eventId) break;
      notificationsNs.to(ROOM_EVENT(attendedPayload.eventId)).emit("event:attendee_update", {
        eventId: attendedPayload.eventId,
        userId: attendedPayload.userId,
        status: "attended",
        timestamp: attendedPayload.timestamp,
      });
      break;
    }
    case "content.flagged": {
      const flaggedPayload = payload as ContentFlaggedEvent;
      if (flaggedPayload?.contentType !== "message" || !flaggedPayload?.contentId) break;
      void (async () => {
        try {
          const rows = await db
            .select({ conversationId: chatMessages.conversationId })
            .from(chatMessages)
            .where(eq(chatMessages.id, flaggedPayload.contentId))
            .limit(1);
          const conversationId = rows[0]?.conversationId;
          if (!conversationId) return;
          chatNs.to(ROOM_CONVERSATION(conversationId)).emit("message:flagged", {
            messageId: flaggedPayload.contentId,
            conversationId,
            replacementText: "[This message is under review]",
          });
        } catch (err) {
          console.error("[eventbus-bridge] content.flagged error:", err);
        }
      })();
      break;
    }
    case "content.moderated": {
      const moderatedPayload = payload as ContentModeratedEvent;
      if (moderatedPayload?.contentType !== "message" || !moderatedPayload?.contentId) break;
      void (async () => {
        try {
          const rows = await db
            .select({ conversationId: chatMessages.conversationId })
            .from(chatMessages)
            .where(eq(chatMessages.id, moderatedPayload.contentId))
            .limit(1);
          const conversationId = rows[0]?.conversationId;
          if (!conversationId) return;
          if (moderatedPayload.action === "dismiss") {
            // Dismiss = false positive — restore content (same as approve)
            chatNs.to(ROOM_CONVERSATION(conversationId)).emit("message:unflagged", {
              messageId: moderatedPayload.contentId,
              conversationId,
            });
          } else if (moderatedPayload.action === "remove") {
            chatNs.to(ROOM_CONVERSATION(conversationId)).emit("message:removed", {
              messageId: moderatedPayload.contentId,
              conversationId,
              replacementText: "[This message was removed by a moderator]",
            });
            try {
              await createNotification({
                userId: moderatedPayload.contentAuthorId,
                type: "admin_announcement",
                title: "Content Removed",
                body: moderatedPayload.reason
                  ? `Your message was removed: ${moderatedPayload.reason}`
                  : "Your message was removed by a moderator.",
              });
            } catch (notifErr) {
              console.error("[eventbus-bridge] content.moderated notification error:", notifErr);
            }
          } else if (moderatedPayload.action === "approve") {
            chatNs.to(ROOM_CONVERSATION(conversationId)).emit("message:unflagged", {
              messageId: moderatedPayload.contentId,
              conversationId,
            });
          }
        } catch (err) {
          console.error("[eventbus-bridge] content.moderated error:", err);
        }
      })();
      break;
    }
    // Portal messaging events — routed to /portal namespace (P-5.2)
    case "portal.message.sent": {
      const portalMsgPayload = payload as PortalMessageSentEvent;
      if (!portalMsgPayload?.conversationId) break;
      // Auto-join both participants to the conversation room.
      // Critical for first-message case: sockets may not be in the room yet.
      if (portalMsgPayload.senderId) {
        portalNs
          .in(ROOM_USER(portalMsgPayload.senderId))
          .socketsJoin(ROOM_CONVERSATION(portalMsgPayload.conversationId));
      }
      if (portalMsgPayload.recipientId) {
        portalNs
          .in(ROOM_USER(portalMsgPayload.recipientId))
          .socketsJoin(ROOM_CONVERSATION(portalMsgPayload.conversationId));
      }
      portalNs.to(ROOM_CONVERSATION(portalMsgPayload.conversationId)).emit("message:new", {
        messageId: portalMsgPayload.messageId,
        conversationId: portalMsgPayload.conversationId,
        senderId: portalMsgPayload.senderId,
        content: portalMsgPayload.content,
        contentType: portalMsgPayload.contentType,
        createdAt: portalMsgPayload.createdAt,
        parentMessageId: portalMsgPayload.parentMessageId ?? null,
        applicationId: portalMsgPayload.applicationId,
        senderRole: portalMsgPayload.senderRole,
      });
      break;
    }
    case "portal.message.edited": {
      const editedPayload = payload as PortalMessageEditedEvent;
      if (!editedPayload?.conversationId || !editedPayload?.messageId) break;
      portalNs.to(ROOM_CONVERSATION(editedPayload.conversationId)).emit("message:edited", {
        messageId: editedPayload.messageId,
        conversationId: editedPayload.conversationId,
        senderId: editedPayload.senderId,
        content: editedPayload.content,
        editedAt: editedPayload.editedAt,
      });
      break;
    }
    case "portal.message.deleted": {
      const deletedPayload = payload as PortalMessageDeletedEvent;
      if (!deletedPayload?.conversationId || !deletedPayload?.messageId) break;
      portalNs.to(ROOM_CONVERSATION(deletedPayload.conversationId)).emit("message:deleted", {
        messageId: deletedPayload.messageId,
        conversationId: deletedPayload.conversationId,
        senderId: deletedPayload.senderId,
        deletedAt: deletedPayload.deletedAt,
      });
      break;
    }
    // Other portal domain events — no-op in realtime server (namespace isolation).
    case "job.published":
    case "job.updated":
    case "job.closed":
    case "application.submitted":
    case "application.status_changed":
    case "application.withdrawn":
      break; // Not routed to community namespaces
    default:
      // Other events not routed in this story
      break;
  }
}
