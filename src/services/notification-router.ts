import "server-only";
import { filterNotificationRecipients } from "@/services/block-service";
import { getConversationNotificationPreference } from "@/db/queries/chat-conversations";
import { getRedisClient } from "@/lib/redis";
import type { NotificationType } from "@/db/schema/platform-notifications";
import {
  getNotificationPreferences,
  DEFAULT_PREFERENCES,
  type NotificationTypeKey,
} from "@/db/queries/notification-preferences";

export interface ChannelDecision {
  suppressed: boolean;
  reason: string;
}

export interface RouteResult {
  inApp: ChannelDecision;
  email: ChannelDecision;
  push: ChannelDecision;
}

export interface RouteParams {
  userId: string;
  actorId: string;
  type: NotificationType;
  conversationId?: string; // for per-conv preference check
}

// Push-eligible types (Story 9.3)
const PUSH_ELIGIBLE_TYPES = new Set<string>([
  "message",
  "mention",
  "event_reminder",
  "admin_announcement",
]);

// High-priority types that warrant email delivery (defaults — overridden by Story 9.4 prefs)
const EMAIL_ELIGIBLE_TYPES = new Set<string>([
  "event_reminder",
  "admin_announcement",
  "message", // first DM only — handler filters by messageCount===1 and conversationType==="direct"
]);
// NOTE: article_* events send email directly in notification-service.ts handlers (4 events)
// NOTE: post_interaction removed — no email template exists for this type

/**
 * NotificationRouter evaluates each notification against delivery rules and returns
 * per-channel decisions (in-app, email, push).
 *
 * Points engine uses EventBus emit → router picks up — no direct router import needed,
 * avoids any future coupling risk. The points.throttled event is handled by
 * notification-service.ts like any other event, routing through this router.
 */
export class NotificationRouter {
  async route(params: RouteParams): Promise<RouteResult> {
    const { userId, actorId, type, conversationId } = params;

    // 1. Block/mute check (skipped for self-notify)
    if (actorId !== userId) {
      const allowed = await filterNotificationRecipients([userId], actorId);
      if (allowed.length === 0) {
        return this.suppressAll("blocked or muted");
      }
    }

    // 2. Per-conversation override (only when conversationId provided)
    if (conversationId) {
      const pref = await getConversationNotificationPreference(conversationId, userId);
      if (pref === "muted") {
        return this.suppressAll("per-conversation muted");
      }
    }

    // 3. Load DB preferences for this user (fall back to defaults if no row)
    const prefs = await getNotificationPreferences(userId);
    const typePref = prefs[type];
    const defaults = DEFAULT_PREFERENCES[type as NotificationTypeKey] ?? {
      inApp: true,
      email: false,
      push: false,
    };

    // 4. In-app: always delivered unless explicitly disabled in preferences
    const inAppEnabled = typePref?.channelInApp ?? defaults.inApp;
    const inApp: ChannelDecision = inAppEnabled
      ? { suppressed: false, reason: "in-app always delivered" }
      : { suppressed: true, reason: `user preference: in-app disabled for type ${type}` };

    // 5. Email: check DnD + type eligibility + DB preference + digest mode
    const redis = getRedisClient();
    const isDnd = await redis.exists(`dnd:${userId}`);
    let email: ChannelDecision;
    if (isDnd) {
      email = { suppressed: true, reason: "quiet hours (dnd key set)" };
    } else if (typePref?.digestMode && typePref.digestMode !== "none") {
      email = { suppressed: true, reason: `digest mode: email batched for type ${type}` };
    } else {
      const emailEnabled = typePref?.channelEmail ?? defaults.email;
      if (!emailEnabled) {
        email = { suppressed: true, reason: `user preference: email disabled for type ${type}` };
      } else if (EMAIL_ELIGIBLE_TYPES.has(type)) {
        email = { suppressed: false, reason: `eligible type: ${type}` };
      } else {
        email = { suppressed: true, reason: "type not in email allowlist (Story 9.2)" };
      }
    }

    // 6. Push: check DnD + type eligibility + DB preference
    let push: ChannelDecision;
    if (isDnd) {
      push = { suppressed: true, reason: "quiet hours (dnd key set)" };
    } else {
      const pushEnabled = typePref?.channelPush ?? defaults.push;
      if (!pushEnabled) {
        push = { suppressed: true, reason: `user preference: push disabled for type ${type}` };
      } else if (PUSH_ELIGIBLE_TYPES.has(type)) {
        push = { suppressed: false, reason: `push eligible type: ${type}` };
      } else {
        push = { suppressed: true, reason: "type not in push allowlist" };
      }
    }

    const result: RouteResult = { inApp, email, push };
    // eslint-disable-next-line no-console -- AC2: routing decision logged at debug level (no DB write)
    console.debug(
      "[NotificationRouter] userId=%s type=%s in_app=%s email=%s push=%s reasons=%j",
      userId,
      type,
      inApp.suppressed ? "suppressed" : "deliver",
      email.suppressed ? "suppressed" : "deliver",
      push.suppressed ? "suppressed" : "deliver",
      { inApp: inApp.reason, email: email.reason, push: push.reason },
    );

    return result;
  }

  private suppressAll(reason: string): RouteResult {
    return {
      inApp: { suppressed: true, reason },
      email: { suppressed: true, reason },
      push: { suppressed: true, reason },
    };
  }
}

export const notificationRouter = new NotificationRouter();
