import "server-only";
import { eventBus } from "@/services/event-bus";
import {
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/db/queries/notifications";
import { getRedisPublisher } from "@/lib/redis";
import { listGroupLeaders } from "@/db/queries/groups";
import { findUserById } from "@/db/queries/auth-queries";
import { enqueueEmailJob } from "@/services/email-service";
import { sendPushNotifications } from "@/services/push-service";
import { notificationRouter } from "@/services/notification-router";
import type {
  MemberApprovedEvent,
  MemberFollowedEvent,
  MessageMentionedEvent,
  MessageSentEvent,
  NotificationCreatedEvent,
  PostReactedEvent,
  PostCommentedEvent,
  GroupJoinRequestedEvent,
  GroupJoinApprovedEvent,
  GroupJoinRejectedEvent,
  GroupLeaderAssignedEvent,
  GroupMemberMutedEvent,
  GroupMemberBannedEvent,
  GroupOwnershipTransferredEvent,
  GroupArchivedEvent,
  AccountStatusChangedEvent,
  ArticleSubmittedEvent,
  ArticlePublishedEvent,
  ArticleRejectedEvent,
  ArticleRevisionRequestedEvent,
  EventWaitlistPromotedEvent,
  EventReminderEvent,
  RecordingMirrorFailedEvent,
  RecordingExpiringWarningEvent,
  PointsThrottledEvent,
} from "@/types/events";
import type { NotificationType } from "@/db/schema/platform-notifications";

/**
 * NotificationService — listens to EventBus events, creates notification
 * records, and delivers them via Redis pub/sub for the realtime container.
 *
 * Routing: NotificationRouter evaluates each notification against channel
 * delivery rules (in-app, email, push) before any channel is invoked.
 * Block/mute filtering and DnD (quiet hours) are handled inside the router.
 *
 * i18n: Notification titles and bodies use message keys (e.g., "notifications.member_approved.title")
 * which are resolved at render time by the client using the user's locale preference.
 */

/**
 * Maps notification types to email template IDs.
 * Returns null when no email template exists for the type.
 *
 * NOTE: "admin_announcement" is currently MVP-coupled to member.approved only.
 * Story 9.4 should decouple this if additional admin announcement types are added.
 */
function getEmailTemplateForType(type: NotificationType): string | null {
  switch (type) {
    case "event_reminder":
      return "notification-event-reminder";
    case "admin_announcement":
      return "notification-member-approved";
    case "message":
      return "notification-first-dm";
    case "mention":
      return "notification-mention"; // Story 9.5: B3
    case "group_activity":
      return "notification-group-activity"; // Story 9.5: B3
    // post_interaction: no event handlers exist yet (deferred — Epic 4 post-interaction story
    //   will add emailData when post.reacted/post.commented handlers are implemented)
    // notification-new-follower template exists but is orphaned: member.followed uses type
    //   "system" (not email-eligible), so the template is never invoked. Deferral noted here
    //   alongside post_interaction until member.followed is redesigned to use type "system"
    //   with email opt-in or a new "follower" type.
    default:
      return null;
  }
}

async function deliverNotification(params: {
  userId: string;
  actorId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  conversationId?: string; // for per-conv pref check via router
  emailData?: Record<string, unknown>; // Story 9.2: event-specific data merged into email template
}): Promise<void> {
  const { userId, actorId, type, title, body, link, conversationId, emailData } = params;

  // Route through NotificationRouter — evaluates block/mute, DnD, per-conv prefs
  const routeResult = await notificationRouter.route({ userId, actorId, type, conversationId });

  // In-app channel: create notification + deliver via Redis pub/sub
  if (!routeResult.inApp.suppressed) {
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

  // Push channel: send via push-service when router says not suppressed (Story 9.3)
  if (!routeResult.push.suppressed) {
    await sendPushNotifications(userId, {
      title,
      body,
      icon: "/icon-192.png",
      link: link ?? "/",
      tag: `${type}:${conversationId ?? "general"}`,
    });
  }

  // Email channel: dispatch via enqueueEmailJob() when router says not suppressed.
  // Article events (submitted/published/rejected/revision_requested) send email directly
  // in their handlers — they are NOT routed through this email channel.
  // Guard: only send when caller explicitly provides emailData (even {} counts).
  // Handlers that don't pass emailData (e.g. article handlers) skip this path.
  if (!routeResult.email.suppressed && emailData !== undefined) {
    const user = await findUserById(userId);
    if (user?.email) {
      // Allow emailData.templateId to override the default type→template mapping
      const templateId =
        (emailData?.templateId as string | undefined) ?? getEmailTemplateForType(type);
      if (templateId) {
        enqueueEmailJob(`notif-${type}-${userId}-${Date.now()}`, {
          to: user.email,
          templateId,
          data: { name: user.name ?? "Member", ...emailData },
          locale: user.languagePreference === "ig" ? "ig" : "en",
        });
      }
    }
  }
}

// ─── EventBus Listeners ───────────────────────────────────────────────────────

// Guard against duplicate handler registration during Next.js dev-mode hot reloads.
// Without this, each re-evaluation of this module would add another copy of every handler.
const globalForNotif = globalThis as unknown as { __notifHandlersRegistered?: boolean };
if (globalForNotif.__notifHandlersRegistered) {
  // Handlers already live on the globalThis-persisted eventBus — skip re-registration
} else {
  globalForNotif.__notifHandlersRegistered = true;

  eventBus.on("member.approved", async (payload: MemberApprovedEvent) => {
    await deliverNotification({
      userId: payload.userId,
      actorId: payload.approvedBy,
      type: "admin_announcement",
      title: "notifications.member_approved.title",
      body: "notifications.member_approved.body",
      link: "/dashboard",
      emailData: {}, // template only needs `name`, added by deliverNotification
    });
  });

  // ─── Post Interaction Notifications ──────────────────────────────────────────

  eventBus.on("post.reacted", async (payload: PostReactedEvent) => {
    // Don't notify if the reactor is the author (self-reactions blocked by service, but guard anyway)
    if (payload.userId === payload.authorId) return;
    await deliverNotification({
      userId: payload.authorId,
      actorId: payload.userId,
      type: "post_interaction",
      title: "notifications.post_reacted.title",
      body: "notifications.post_reacted.body",
      link: `/feed#post-${payload.postId}`,
    });
  });

  eventBus.on("post.commented", async (payload: PostCommentedEvent) => {
    // Don't notify if commenting on own post
    if (!payload.postAuthorId || payload.userId === payload.postAuthorId) return;
    await deliverNotification({
      userId: payload.postAuthorId,
      actorId: payload.userId,
      type: "post_interaction",
      title: "notifications.post_commented.title",
      body: "notifications.post_commented.body",
      link: `/feed#post-${payload.postId}`,
    });
  });

  eventBus.on("member.followed", async (payload: MemberFollowedEvent) => {
    await deliverNotification({
      userId: payload.followedId,
      actorId: payload.followerId,
      type: "system",
      title: "notifications.new_follower.title",
      body: "notifications.new_follower.body",
      link: `/profiles/${payload.followerId}`,
    });
  });

  eventBus.on("message.mentioned", async (payload: MessageMentionedEvent) => {
    const { conversationId, senderId, mentionedUserIds, contentPreview } = payload;

    for (const recipientId of mentionedUserIds) {
      // Router handles per-conversation pref check (muted/mentions/all) and DnD.
      // NOTE: DnD behavior change (Epic 9 retro AI-4): previously suppressed ALL delivery
      // (including in-app) for message.mentioned. After this refactoring, DnD only suppresses
      // email/push — in-app is always delivered per AC3 (silent accumulation, no toast/sound).
      await deliverNotification({
        userId: recipientId,
        actorId: senderId,
        type: "mention",
        title: "notifications.mention.title",
        body: contentPreview,
        link: `/chat?conversation=${conversationId}`,
        conversationId, // router checks per-conv pref + DnD
        emailData: { preview: contentPreview, link: `/chat?conversation=${conversationId}` },
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
        emailData: { link: `/groups/${payload.groupId}` },
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
      emailData: { link: `/groups/${payload.groupId}` },
    });
  });

  eventBus.on("group.join_rejected", async (payload: GroupJoinRejectedEvent) => {
    await deliverNotification({
      userId: payload.userId,
      actorId: payload.rejectedBy,
      type: "group_activity",
      title: "notifications.group_join_rejected.title",
      body: "notifications.group_join_rejected.body",
      emailData: { link: "/dashboard" },
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
      emailData: { link: `/groups/${payload.groupId}` },
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
      emailData: { link: `/groups/${payload.groupId}` },
    });
  });

  eventBus.on("group.member_banned", async (payload: GroupMemberBannedEvent) => {
    await deliverNotification({
      userId: payload.userId,
      actorId: payload.moderatorId,
      type: "group_activity",
      title: "notifications.group_member_banned.title",
      body: "notifications.group_member_banned.body",
      emailData: { link: "/dashboard" },
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
      emailData: { link: `/groups/${payload.groupId}` },
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
        emailData: { link: `/groups/${payload.groupId}` },
      });
    }
  });

  // ─── Article Publication Notifications (Story 6.2) ───────────────────────────

  // Email sent directly (not via NotificationRouter email channel) —
  // article events use custom templates. NotificationRouter email stub would no-op here.
  // NOTE: article.submitted only sends email — no in-app notification (author already sees submission UX).
  eventBus.on("article.submitted", async (payload: ArticleSubmittedEvent) => {
    const user = await findUserById(payload.authorId);
    if (user?.email) {
      enqueueEmailJob(`article-submitted-${payload.articleId}-${Date.now()}`, {
        to: user.email,
        templateId: "article-submitted",
        data: {
          name: user.name ?? user.email,
          title: payload.title,
        },
        locale: user.languagePreference === "ig" ? "ig" : "en",
      });
    }
  });

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
    // Email sent directly (not via NotificationRouter email channel) —
    // article events use custom templates. NotificationRouter email stub would no-op here.
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
    // Email sent directly (not via NotificationRouter email channel) —
    // article events use custom templates. NotificationRouter email stub would no-op here.
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
    // Email sent directly (not via NotificationRouter email channel) —
    // article events use custom templates. NotificationRouter email stub would no-op here.
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
  // ─── Event RSVP Notifications (Story 7.2) ────────────────────────────────

  eventBus.on("event.waitlist_promoted", async (payload: EventWaitlistPromotedEvent) => {
    // actorId = promotedUserId (self-notification pattern for system events)
    // This ensures block/mute filter never suppresses a platform promotion notice
    await deliverNotification({
      userId: payload.promotedUserId,
      actorId: payload.promotedUserId,
      type: "event_reminder",
      title: "notifications.event_waitlist_promoted.title",
      body: payload.title, // event title as notification body
      link: `/events/${payload.eventId}`,
      emailData: {
        eventTitle: payload.title,
        startTime: payload.startTime,
        eventUrl: `/events/${payload.eventId}`,
      },
    });
  });

  // ─── Event Reminder Notifications (Story 7.4) ─────────────────────────────

  eventBus.on("event.reminder", async (payload: EventReminderEvent) => {
    await deliverNotification({
      userId: payload.userId,
      actorId: payload.userId, // self-notification: bypass block/mute filter
      type: "event_reminder",
      title: "notifications.event_reminder.title",
      body: payload.title,
      link: `/events/${payload.eventId}`,
      emailData: {
        eventTitle: payload.title,
        startTime: payload.startTime,
        eventUrl: `/events/${payload.eventId}`,
      },
    });
  });

  // ─── Recording Failure Notifications (Story 7.4) ──────────────────────────

  eventBus.on("recording.mirror_failed", async (payload: RecordingMirrorFailedEvent) => {
    const { getEventById } = await import("@/db/queries/events");
    const event = await getEventById(payload.eventId);
    if (!event) return;

    await deliverNotification({
      userId: event.creatorId,
      actorId: event.creatorId,
      type: "system",
      title: "notifications.recording_failed.title",
      body: event.title,
      link: `/events/${payload.eventId}`,
    });
  });

  // ─── Recording Expiry Warning Notifications (Story 7.4) ───────────────────

  eventBus.on("recording.expiring_warning", async (payload: RecordingExpiringWarningEvent) => {
    const { getEventById } = await import("@/db/queries/events");
    const event = await getEventById(payload.eventId);
    if (!event) return;

    await deliverNotification({
      userId: event.creatorId,
      actorId: event.creatorId,
      type: "system",
      title: "notifications.recording_expiring.title",
      body: payload.title,
      link: `/events/${payload.eventId}`,
    });
  });

  // ─── First DM Email Notification (Story 9.2) ──────────────────────────────────
  // Only triggers email for the FIRST message in a direct conversation (FR73).
  // No in-app notification — chat already delivers real-time via Socket.IO.
  // Group/channel messages and subsequent messages are filtered out below.

  eventBus.on("message.sent", async (payload: MessageSentEvent) => {
    if (payload.conversationType !== "direct") return;
    if (payload.messageCount !== 1) return;
    if (!payload.recipientId) return;
    await deliverNotification({
      userId: payload.recipientId,
      actorId: payload.senderId,
      type: "message",
      title: "notifications.new_message.title",
      body: "notifications.new_message.body",
      link: `/chat/${payload.conversationId}`,
      emailData: {
        senderName: payload.senderName ?? "A member",
        messagePreview: payload.messagePreview ?? "",
        chatUrl: `/chat/${payload.conversationId}`,
      },
    });
  });

  // ─── Points Throttled Notification (Epic 8 retro AI-4 — Story 9.1) ────────────
  // points-engine.ts emits this via EventBus instead of calling createNotification()
  // directly (avoids circular dep). Routed through NotificationRouter like all others.

  eventBus.on("points.throttled", async (payload: PointsThrottledEvent) => {
    await deliverNotification({
      userId: payload.userId,
      actorId: payload.userId, // self-notify — bypasses block filter
      type: "system",
      title: "notifications.points_throttled.title",
      body: "notifications.points_throttled.body",
      link: "/points",
    });
  });

  // ─── Discipline Notifications (Story 11.3) ───────────────────────────────────
  // System-generated notifications for warnings, suspensions, and bans.
  // actorId = userId (self-notification pattern) so block/mute filters don't suppress them.

  eventBus.on(
    "account.discipline_issued",
    async (payload: {
      userId: string;
      disciplineType: string;
      reason: string;
      disciplineId: string;
      suspensionEndsAt?: string;
      timestamp: string;
    }) => {
      if (payload.disciplineType === "warning") {
        await deliverNotification({
          userId: payload.userId,
          actorId: payload.userId,
          type: "admin_announcement",
          title: "notifications.discipline.warning.title",
          body: "notifications.discipline.warning.body",
          link: "/dashboard",
          emailData: {
            templateId: "discipline-warning",
            reason: payload.reason,
            communityGuidelinesUrl: "/terms",
          },
        });
      } else if (payload.disciplineType === "suspension") {
        const endsAtDate = payload.suspensionEndsAt ? new Date(payload.suspensionEndsAt) : null;
        await deliverNotification({
          userId: payload.userId,
          actorId: payload.userId,
          type: "admin_announcement",
          title: "notifications.discipline.suspension.title",
          body: "notifications.discipline.suspension.body",
          link: "/suspended",
          emailData: {
            templateId: "discipline-suspension",
            reason: payload.reason,
            duration: endsAtDate ? `Until ${endsAtDate.toLocaleDateString()}` : "Indefinite",
            endsAt: endsAtDate ? endsAtDate.toUTCString() : null,
            communityGuidelinesUrl: "/terms",
          },
        });
      } else if (payload.disciplineType === "ban") {
        // Ban: send email directly — no in-app notification (member is locked out)
        const user = await findUserById(payload.userId);
        if (user?.email) {
          enqueueEmailJob(`discipline-ban-${payload.userId}-${Date.now()}`, {
            to: user.email,
            templateId: "discipline-ban",
            data: {
              name: user.name ?? "Member",
              reason: payload.reason,
            },
            locale: user.languagePreference === "ig" ? "ig" : "en",
          });
        }
      }
    },
  );

  // ─── Discipline Lifted Notification ────────────────────────────────────────
  // Notifies user when their suspension is lifted early by an admin.

  eventBus.on(
    "account.discipline_lifted",
    async (payload: {
      userId: string;
      disciplineId: string;
      reason: string;
      liftedBy: string;
      timestamp: string;
    }) => {
      await deliverNotification({
        userId: payload.userId,
        actorId: payload.userId, // self-notification pattern
        type: "admin_announcement",
        title: "notifications.discipline.lifted.title",
        body: "notifications.discipline.lifted.body",
        link: "/dashboard",
        emailData: {
          templateId: "discipline-suspension-lifted",
          reason: payload.reason,
        },
      });
    },
  );

  // ─── Content Removal Email Notification (Epic 11 Stabilization) ───────────
  // Sends email to content author when their content is removed by a moderator.

  eventBus.on(
    "content.moderated",
    async (payload: {
      contentType: "post" | "article" | "message";
      contentId: string;
      contentAuthorId: string;
      action: "approve" | "remove" | "dismiss";
      moderatorId: string;
      reason?: string;
      contentPreview?: string | null;
      timestamp: string;
    }) => {
      if (payload.action !== "remove") return;
      const user = await findUserById(payload.contentAuthorId);
      if (!user?.email) return;
      enqueueEmailJob(`content-removal-${payload.contentId}-${Date.now()}`, {
        to: user.email,
        templateId: "content-removal",
        data: {
          name: user.name ?? "Member",
          contentType: payload.contentType,
          contentPreview: payload.contentPreview ?? null,
          reason: payload.reason ?? "Violation of Community Guidelines",
          communityGuidelinesUrl: "/terms",
        },
        locale: user.languagePreference === "ig" ? "ig" : "en",
      });
    },
  );
} // end of hot-reload guard (globalForNotif.__notifHandlersRegistered)

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
