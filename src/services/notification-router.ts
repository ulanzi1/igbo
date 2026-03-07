import "server-only";
import { filterNotificationRecipients } from "@/services/block-service";
import { getConversationNotificationPreference } from "@/db/queries/chat-conversations";
import { getRedisClient } from "@/lib/redis";
import type { NotificationType } from "@/db/schema/platform-notifications";

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

    // 3. In-app: always delivered
    const inApp: ChannelDecision = { suppressed: false, reason: "in-app always delivered" };

    // 4. Email: check DnD + type eligibility
    const redis = getRedisClient();
    const isDnd = await redis.exists(`dnd:${userId}`);
    let email: ChannelDecision;
    if (isDnd) {
      email = { suppressed: true, reason: "quiet hours (dnd key set)" };
    } else if (EMAIL_ELIGIBLE_TYPES.has(type)) {
      email = { suppressed: false, reason: `eligible type: ${type}` };
    } else {
      email = { suppressed: true, reason: "type not in email allowlist (Story 9.2)" };
    }

    // 5. Push: not yet implemented (Story 9.3)
    const push: ChannelDecision = {
      suppressed: true,
      reason: "push not yet implemented (Story 9.3)",
    };

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
