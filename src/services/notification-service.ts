import "server-only";
import { eventBus } from "@/services/event-bus";
import {
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/db/queries/notifications";
import { filterNotificationRecipients } from "@/services/block-service";
import { getConversationNotificationPreference } from "@/db/queries/chat-conversations";
import { getRedisPublisher } from "@/lib/redis";
import type {
  MemberApprovedEvent,
  MemberFollowedEvent,
  MessageMentionedEvent,
  NotificationCreatedEvent,
} from "@/types/events";
import type { NotificationType } from "@/db/schema/platform-notifications";

/**
 * NotificationService — listens to EventBus events, creates notification
 * records, and delivers them via Redis pub/sub for the realtime container.
 *
 * Block/mute filtering: notifications from blocked or muted actors are suppressed.
 * Real-time delivery: uses Redis publish to `eventbus:notification.created`
 * so the realtime container's EventBus bridge forwards to Socket.IO rooms.
 *
 * i18n: Notification titles and bodies use message keys (e.g., "notifications.member_approved.title")
 * which are resolved at render time by the client using the user's locale preference.
 */

async function deliverNotification(params: {
  userId: string;
  actorId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  const { userId, actorId, type, title, body, link } = params;

  // Filter: skip if recipient has blocked or muted the actor
  const allowed = await filterNotificationRecipients([userId], actorId);
  if (allowed.length === 0) return;

  const notification = await createNotification({ userId, type, title, body, link });

  // Publish to Redis for realtime delivery via eventbus bridge
  const payload: NotificationCreatedEvent = {
    userId,
    notificationId: notification.id,
    type,
    title,
    body,
    link,
    timestamp: notification.createdAt.toISOString(),
  };

  try {
    const publisher = getRedisPublisher();
    await publisher
      .publish("eventbus:notification.created", JSON.stringify(payload))
      .catch((err: unknown) => {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "notification.redis_publish_failed",
            error: String(err),
          }),
        );
      });
  } catch (err: unknown) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "notification.redis_connect_failed",
        error: String(err),
      }),
    );
  }
}

// ─── EventBus Listeners ───────────────────────────────────────────────────────

eventBus.on("member.approved", async (payload: MemberApprovedEvent) => {
  await deliverNotification({
    userId: payload.userId,
    actorId: payload.approvedBy,
    type: "admin_announcement",
    title: "notifications.member_approved.title",
    body: "notifications.member_approved.body",
    link: "/dashboard",
  });
});

// NOTE: post.reacted, post.commented, and message.sent handlers are intentionally
// deferred — their event types do not carry the target recipient's ID (post author
// or message recipient). These will be implemented when the posts (Epic 4) and
// chat (Epic 2) features are built and the event types include authorId/recipientId.

eventBus.on("member.followed", async (payload: MemberFollowedEvent) => {
  await deliverNotification({
    userId: payload.followedId,
    actorId: payload.followerId,
    type: "system",
    title: "notifications.new_follower.title",
    body: "notifications.new_follower.body",
    link: "/profile",
  });
});

eventBus.on("message.mentioned", async (payload: MessageMentionedEvent) => {
  const { conversationId, senderId, mentionedUserIds, contentPreview } = payload;
  const redis = getRedisPublisher();

  for (const recipientId of mentionedUserIds) {
    // Check per-conversation notification preference
    const pref = await getConversationNotificationPreference(conversationId, recipientId);
    if (pref === "muted") {
      continue; // suppress — user has muted this conversation
    }
    // "mentions" preference allows message.mentioned through (it IS a mention)
    // "all" also allows through

    // Check global DnD
    const isDnd = await redis.exists(`dnd:${recipientId}`);
    if (isDnd) {
      continue; // suppress — DnD active
    }

    await deliverNotification({
      userId: recipientId,
      actorId: senderId,
      type: "mention",
      title: "notifications.mention.title",
      body: contentPreview,
      link: `/chat?conversation=${conversationId}`,
    });
  }
});

// ─── Service Functions (called by API routes) ─────────────────────────────────

/**
 * Mark a single notification as read and emit the corresponding event.
 * Moves EventBus emit out of the route handler (project pattern: emit from services).
 */
export async function markNotificationAsRead(id: string, userId: string): Promise<boolean> {
  const updated = await markNotificationRead(id, userId);
  if (updated) {
    eventBus.emit("notification.read", {
      userId,
      notificationId: id,
      timestamp: new Date().toISOString(),
    });
  }
  return updated;
}

/**
 * Mark all notifications as read and emit the corresponding event.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await markAllNotificationsRead(userId);
  eventBus.emit("notification.read", {
    userId,
    notificationId: "all",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Initialize the notification service — call once at app startup.
 * EventBus listeners are registered at module load; this function is
 * provided for explicit startup tracking / testing purposes.
 */
export function initNotificationService(): void {
  // Listeners are registered above at module load time
  // This function serves as an explicit initialization marker
}
