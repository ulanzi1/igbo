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
import { listGroupLeaders } from "@/db/queries/groups";
import { findUserById } from "@/db/queries/auth-queries";
import { enqueueEmailJob } from "@/services/email-service";
import type {
  MemberApprovedEvent,
  MemberFollowedEvent,
  MessageMentionedEvent,
  NotificationCreatedEvent,
  GroupJoinRequestedEvent,
  GroupJoinApprovedEvent,
  GroupJoinRejectedEvent,
  GroupLeaderAssignedEvent,
  GroupMemberMutedEvent,
  GroupMemberBannedEvent,
  GroupOwnershipTransferredEvent,
  GroupArchivedEvent,
  AccountStatusChangedEvent,
  ArticlePublishedEvent,
  ArticleRejectedEvent,
  ArticleRevisionRequestedEvent,
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

// ─── Group Membership Notifications (Story 5.2) ──────────────────────────────

eventBus.on("group.join_requested", async (payload: GroupJoinRequestedEvent) => {
  const leaders = await listGroupLeaders(payload.groupId);
  for (const leaderId of leaders) {
    await deliverNotification({
      userId: leaderId,
      actorId: payload.userId,
      type: "group_activity",
      title: "notifications.group_join_request.title",
      body: "notifications.group_join_request.body",
      link: `/groups/${payload.groupId}`,
    });
  }
});

eventBus.on("group.join_approved", async (payload: GroupJoinApprovedEvent) => {
  await deliverNotification({
    userId: payload.userId,
    actorId: payload.approvedBy,
    type: "group_activity",
    title: "notifications.group_join_approved.title",
    body: "notifications.group_join_approved.body",
    link: `/groups/${payload.groupId}`,
  });
});

eventBus.on("group.join_rejected", async (payload: GroupJoinRejectedEvent) => {
  await deliverNotification({
    userId: payload.userId,
    actorId: payload.rejectedBy,
    type: "group_activity",
    title: "notifications.group_join_rejected.title",
    body: "notifications.group_join_rejected.body",
  });
});

// ─── Group Leadership & Moderation Notifications (Story 5.4) ─────────────────

eventBus.on("group.leader_assigned", async (payload: GroupLeaderAssignedEvent) => {
  await deliverNotification({
    userId: payload.userId,
    actorId: payload.assignedBy,
    type: "group_activity",
    title: "notifications.group_leader_assigned.title",
    body: "notifications.group_leader_assigned.body",
    link: `/groups/${payload.groupId}`,
  });
});

eventBus.on("group.member_muted", async (payload: GroupMemberMutedEvent) => {
  await deliverNotification({
    userId: payload.userId,
    actorId: payload.moderatorId,
    type: "group_activity",
    title: "notifications.group_member_muted.title",
    body: "notifications.group_member_muted.body",
    link: `/groups/${payload.groupId}`,
  });
});

eventBus.on("group.member_banned", async (payload: GroupMemberBannedEvent) => {
  await deliverNotification({
    userId: payload.userId,
    actorId: payload.moderatorId,
    type: "group_activity",
    title: "notifications.group_member_banned.title",
    body: "notifications.group_member_banned.body",
  });
});

eventBus.on("group.ownership_transferred", async (payload: GroupOwnershipTransferredEvent) => {
  await deliverNotification({
    userId: payload.newOwnerId,
    actorId: payload.previousOwnerId,
    type: "group_activity",
    title: "notifications.group_ownership_transferred.title",
    body: "notifications.group_ownership_transferred.body",
    link: `/groups/${payload.groupId}`,
  });
});

eventBus.on("group.archived", async (payload: GroupArchivedEvent) => {
  // Look up all active members to notify them
  const { listActiveGroupMemberIds } = await import("@/db/queries/group-channels");
  const memberIds = await listActiveGroupMemberIds(payload.groupId);
  for (const userId of memberIds) {
    await deliverNotification({
      userId,
      actorId: payload.archivedBy,
      type: "group_activity",
      title: "notifications.group_archived.title",
      body: "notifications.group_archived.body",
      link: `/groups/${payload.groupId}`,
    });
  }
});

// ─── Article Publication Notifications (Story 6.2) ───────────────────────────

// self-notify pattern: bypasses block/mute filter (actorId === userId)
eventBus.on("article.published", async (payload: ArticlePublishedEvent) => {
  await deliverNotification({
    userId: payload.authorId,
    actorId: payload.authorId, // self-notify pattern: bypasses block/mute filter
    type: "admin_announcement",
    title: "notifications.article_published.title",
    body: "notifications.article_published.body",
    link: `/articles/${payload.slug}`,
  });
  // Email notification
  const user = await findUserById(payload.authorId);
  if (user?.email) {
    enqueueEmailJob(`article-published-${payload.articleId}-${Date.now()}`, {
      to: user.email,
      templateId: "article-published",
      data: {
        name: user.name ?? user.email,
        title: payload.title,
        articleUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/en/articles/${payload.slug}`,
      },
      locale: user.languagePreference === "ig" ? "ig" : "en",
    });
  }
});

eventBus.on("article.rejected", async (payload: ArticleRejectedEvent) => {
  await deliverNotification({
    userId: payload.authorId,
    actorId: payload.authorId, // self-notify pattern: bypasses block/mute filter
    type: "admin_announcement",
    title: "notifications.article_rejected.title",
    body: payload.feedback ?? "notifications.article_rejected.body",
    link: `/articles/${payload.articleId}/edit`,
  });
  // Email notification
  const user = await findUserById(payload.authorId);
  if (user?.email) {
    enqueueEmailJob(`article-rejected-${payload.articleId}-${Date.now()}`, {
      to: user.email,
      templateId: "article-rejected",
      data: {
        name: user.name ?? user.email,
        title: payload.title,
        feedback: payload.feedback ?? "",
        editUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/en/articles/${payload.articleId}/edit`,
      },
      locale: user.languagePreference === "ig" ? "ig" : "en",
    });
  }
});

eventBus.on("article.revision_requested", async (payload: ArticleRevisionRequestedEvent) => {
  await deliverNotification({
    userId: payload.authorId,
    actorId: payload.authorId, // self-notify pattern: bypasses block/mute filter
    type: "admin_announcement",
    title: "notifications.article_revision_requested.title",
    body: payload.feedback,
    link: `/articles/${payload.articleId}/edit`,
  });
  const user = await findUserById(payload.authorId);
  if (user?.email) {
    enqueueEmailJob(`article-revision-${payload.articleId}-${Date.now()}`, {
      to: user.email,
      templateId: "article-revision-requested",
      data: {
        name: user.name ?? user.email,
        title: payload.title,
        feedback: payload.feedback,
        editUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/en/articles/${payload.articleId}/edit`,
      },
      locale: user.languagePreference === "ig" ? "ig" : "en",
    });
  }
});

// ─── Ownership Transfer on Account Status Change ──────────────────────────────

eventBus.on("account.status_changed", async (payload: AccountStatusChangedEvent) => {
  const suspendedStatuses = ["SUSPENDED", "PENDING_DELETION", "ANONYMIZED"];
  if (!suspendedStatuses.includes(payload.newStatus)) return;

  // Find all groups where user is creator and trigger ownership transfer
  const { db } = await import("@/db");
  const { communityGroups, communityGroupMembers } = await import("@/db/schema/community-groups");
  const { and, eq, sql } = await import("drizzle-orm");

  const creatorGroups = await db
    .select({ groupId: communityGroups.id })
    .from(communityGroups)
    .innerJoin(communityGroupMembers, eq(communityGroupMembers.groupId, communityGroups.id))
    .where(
      and(
        eq(communityGroupMembers.userId, payload.userId),
        eq(communityGroupMembers.role, "creator"),
        eq(communityGroupMembers.status, "active"),
        sql`${communityGroups.deletedAt} IS NULL`,
      ),
    );

  if (creatorGroups.length > 0) {
    const { transferGroupOwnership } = await import("@/services/group-service");
    for (const { groupId } of creatorGroups) {
      await transferGroupOwnership(groupId, payload.userId);
    }
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
