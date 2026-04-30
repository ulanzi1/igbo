import "server-only";
import { createNotification } from "@igbo/db/queries/notifications";
import { sendPushNotification } from "@/services/push-service";
import type { PortalPushPayload } from "@/services/push-service";
import { enqueueEmailJob } from "@/services/email-service";
import type { EmailPayload } from "@/services/email-service";
import { getRedisClient } from "@/lib/redis";
import { createRedisKey } from "@igbo/config/redis";
import {
  PORTAL_NOTIFICATION_CATALOG,
  THROTTLE_WINDOWS,
  isSystemCritical,
  isKnownEventType,
} from "@igbo/config/notifications";
import type { PortalNotificationEventType } from "@igbo/config/notifications";
import type { NotificationCreatedEvent } from "@igbo/config/events";

// ---------------------------------------------------------------------------
// DispatchOptions interface
// ---------------------------------------------------------------------------

export interface NotificationContent {
  title: string;
  body: string;
  link?: string;
}

export interface DispatchOptions {
  /** Notification recipient */
  userId: string;
  /** Portal notification event type from catalog */
  eventType: PortalNotificationEventType;
  /** In-app and push notification content */
  content: NotificationContent;
  /** Used for BOTH Redis NX dedup check AND DB idempotencyKey */
  dedupKey: string;
  /** Omit to skip email channel */
  emailJob?: { name: string; payload: EmailPayload };
  /** Omit to skip push channel */
  pushPayload?: PortalPushPayload;
  /**
   * Custom Redis throttle key (e.g. per-conversation for message events).
   * If absent and eventType has a THROTTLE_WINDOW, defaults to:
   *   createRedisKey("portal", "throttle", `notif:${userId}:${eventType}`)
   */
  throttleKey?: string;
}

// ---------------------------------------------------------------------------
// Step 1 — Resolve preferences
// ---------------------------------------------------------------------------

/**
 * Returns default channel settings for the given event type.
 * Falls back to all-disabled if eventType is not in the catalog (fail-closed).
 */
export function resolveChannels(
  _userId: string,
  eventType: string,
): { inApp: boolean; push: boolean; email: boolean } {
  if (!isKnownEventType(eventType)) {
    return { inApp: false, push: false, email: false };
  }
  return PORTAL_NOTIFICATION_CATALOG[eventType].defaultChannels;
}

// ---------------------------------------------------------------------------
// Step 2 — Apply priority rules
// ---------------------------------------------------------------------------

/**
 * Overrides channels to all-enabled for system-critical events.
 * System-critical events cannot be disabled by user.
 */
export function applyPriorityRules(
  eventType: string,
  channels: { inApp: boolean; push: boolean; email: boolean },
): { inApp: boolean; push: boolean; email: boolean } {
  try {
    if (isSystemCritical(eventType)) {
      return { inApp: true, push: true, email: true };
    }
  } catch (err) {
    // Fail-open: if isSystemCritical errors, treat as normal priority
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.notification.router.priority_check_error",
        eventType,
        error: String(err),
      }),
    );
  }
  return channels;
}

// ---------------------------------------------------------------------------
// Step 3 — Noise guard (throttle)
// ---------------------------------------------------------------------------

/**
 * Atomic Redis SET NX EX throttle check.
 * Returns true if throttled (key already exists), false if key was set (proceed).
 * Fail-open: if Redis throws, returns false (not throttled — over-notifying > silent drop).
 */
export async function checkThrottle(throttleKey: string, windowSeconds: number): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.set(throttleKey, "1", "EX", windowSeconds, "NX");
    // "OK" = key was set = not throttled; null = key existed = throttled
    return result === null;
  } catch {
    // Redis down — fail-open (skip throttle, send notification)
    return false;
  }
}

// ---------------------------------------------------------------------------
// Steps 4+5 — Channel dispatchers (helpers for the channel decision + dispatch phases)
// ---------------------------------------------------------------------------

/**
 * In-app channel dispatcher.
 * Creates the notification record and publishes to Redis pub/sub for real-time delivery.
 * Absorbs publishNotificationCreated() — this is the sole owner of the Redis publish.
 *
 * The Redis channel name "eventbus:notification.created" and payload format MUST NOT change
 * (eventbus-bridge depends on them).
 */
export async function dispatchInApp(
  userId: string,
  eventType: PortalNotificationEventType,
  content: NotificationContent,
  dedupKey: string,
): Promise<void> {
  const notif = await createNotification({
    userId,
    type: "system",
    title: content.title,
    body: content.body,
    link: content.link,
    idempotencyKey: dedupKey,
  });

  if (!notif) {
    // DB-level dedup: notification already exists for this idempotencyKey
    console.info(
      JSON.stringify({
        level: "info",
        message: "portal.notification.router.inapp.db_dedup_skipped",
        userId,
        eventType,
        dedupKey,
      }),
    );
    return;
  }

  // Publish for real-time delivery via eventbus-bridge → /notifications:notification:new
  const payload: NotificationCreatedEvent = {
    eventId: notif.id,
    version: 1,
    timestamp: notif.createdAt.toISOString(),
    notificationId: notif.id,
    userId,
    type: "system",
    title: content.title,
    body: content.body,
    link: content.link,
    eventType,
  };
  const redis = getRedisClient();
  await redis.publish("eventbus:notification.created", JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Primary dispatch function — 5-step pipeline
// ---------------------------------------------------------------------------

/**
 * Centralized 5-step notification routing pipeline.
 *
 * Step 1 — Resolve preferences (catalog defaults; no DB query until Story 6.4)
 * Step 2 — Apply priority rules (system-critical overrides all channels to enabled)
 * Step 3 — Noise guard (atomic Redis SET NX EX; fail-open if Redis down)
 * Step 4 — Channel decision (omitted payload = skip that channel)
 * Step 5 — Dispatch via Promise.allSettled (channel failures are independent)
 */
export async function dispatchNotification(options: DispatchOptions): Promise<void> {
  const { userId, eventType, content, dedupKey, emailJob, pushPayload, throttleKey } = options;

  // ── Step 1: Resolve preferences ─────────────────────────────────────────
  let channels = resolveChannels(userId, eventType);

  // ── Step 2: Apply priority rules ─────────────────────────────────────────
  channels = applyPriorityRules(eventType, channels);

  // ── Step 3: Noise guard ───────────────────────────────────────────────────
  const throttleWindow = THROTTLE_WINDOWS[eventType];
  if (throttleWindow !== undefined) {
    const resolvedThrottleKey =
      throttleKey ?? createRedisKey("portal", "throttle", `notif:${userId}:${eventType}`);
    const throttled = await checkThrottle(resolvedThrottleKey, throttleWindow);
    if (throttled) {
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.notification.router.throttled",
          userId,
          eventType,
          throttleKey: resolvedThrottleKey,
        }),
      );
      return;
    }
  }

  // ── Step 4: Channel decision ──────────────────────────────────────────────
  // Omitted payload = skip channel regardless of resolved channels
  const sendInApp = channels.inApp;
  const sendPush = channels.push && pushPayload !== undefined;
  const sendEmail = channels.email && emailJob !== undefined;

  if (!sendInApp && !sendPush && !sendEmail) {
    console.info(
      JSON.stringify({
        level: "info",
        message: "portal.notification.router.all_channels_disabled",
        userId,
        eventType,
      }),
    );
    return;
  }

  // ── Step 5: Dispatch (independent per channel) ────────────────────────────
  const dispatches: Promise<void>[] = [];

  if (sendInApp) {
    dispatches.push(
      dispatchInApp(userId, eventType, content, dedupKey).catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.router.inapp.error",
            userId,
            eventType,
            error: String(err),
          }),
        );
      }),
    );
  }

  if (sendPush) {
    const pushJob: Promise<void> = sendPushNotification(userId, pushPayload)
      .then(() => undefined)
      .catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.router.push.error",
            userId,
            eventType,
            error: String(err),
          }),
        );
      });
    dispatches.push(pushJob);
  }

  if (sendEmail) {
    const { name: emailName, payload: emailPayload } = emailJob;
    const emailDispatch: Promise<void> = enqueueEmailJob(emailName, emailPayload)
      .then(() => undefined)
      .catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.router.email.error",
            userId,
            eventType,
            error: String(err),
          }),
        );
      });
    dispatches.push(emailDispatch);
  }

  const results = await Promise.allSettled(dispatches);

  // Log any unexpected rejections (Promise.allSettled should handle all, but be defensive)
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.notification.router.dispatch.unexpected_error",
          userId,
          eventType,
          error: String(result.reason),
        }),
      );
    }
  }
}
