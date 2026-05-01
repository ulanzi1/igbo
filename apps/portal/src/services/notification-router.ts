import "server-only";
import { createNotification } from "@igbo/db/queries/notifications";
import {
  getNotificationPreferences,
  isUserInQuietHours,
} from "@igbo/db/queries/notification-preferences";
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

const PREFS_CACHE_TTL_SECONDS = 60;

/**
 * Returns channel settings for the given event type by querying user preferences
 * from the DB. Falls back to catalog defaults on DB error (fail-open).
 * Preferences are cached in Redis for 60s to avoid a DB read on every dispatch.
 */
export async function resolveChannels(
  userId: string,
  eventType: string,
): Promise<{ inApp: boolean; push: boolean; email: boolean }> {
  if (!isKnownEventType(eventType)) {
    return { inApp: false, push: false, email: false };
  }

  const catalogDefaults = PORTAL_NOTIFICATION_CATALOG[eventType].defaultChannels;
  const cacheKey = createRedisKey("notif", "prefs", userId);

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);

    let prefs: Record<
      string,
      { channelInApp: boolean; channelPush: boolean; channelEmail: boolean }
    >;
    if (cached) {
      try {
        prefs = JSON.parse(cached) as Record<
          string,
          { channelInApp: boolean; channelPush: boolean; channelEmail: boolean }
        >;
      } catch {
        // Corrupted cache — evict and fall through to DB
        redis.del(cacheKey).catch(() => {});
        prefs = await getNotificationPreferences(userId);
        redis.set(cacheKey, JSON.stringify(prefs), "EX", PREFS_CACHE_TTL_SECONDS).catch(() => {});
      }
    } else {
      prefs = await getNotificationPreferences(userId);
      // Warm the cache — fire and forget, don't fail if Redis is down
      redis.set(cacheKey, JSON.stringify(prefs), "EX", PREFS_CACHE_TTL_SECONDS).catch(() => {});
    }

    const userPref = prefs[eventType];
    if (!userPref) {
      return { ...catalogDefaults };
    }

    return {
      inApp: userPref.channelInApp,
      push: userPref.channelPush,
      email: userPref.channelEmail,
    };
  } catch (err) {
    // DB or parse error — fail-open with catalog defaults
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.notification.router.preferences_fetch_error",
        userId,
        eventType,
        error: String(err),
      }),
    );
    return { ...catalogDefaults };
  }
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
// Step 2.5 — Quiet hours check
// ---------------------------------------------------------------------------

/**
 * Suppresses push and email channels during user's quiet hours.
 * In-app is always delivered. System-critical events bypass quiet hours.
 * Fail-open: if DB throws, quiet hours are NOT applied (over-notify > silent drop).
 */
export async function applyQuietHours(
  userId: string,
  eventType: string,
  channels: { inApp: boolean; push: boolean; email: boolean },
): Promise<{ inApp: boolean; push: boolean; email: boolean }> {
  if (isSystemCritical(eventType)) {
    return channels;
  }

  try {
    const inQuietHours = await isUserInQuietHours(userId, new Date());
    if (inQuietHours) {
      const suppressed = { ...channels, push: false, email: false };
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.notification.router.quiet_hours_suppression",
          userId,
          eventType,
          channelsAfterSuppression: suppressed,
        }),
      );
      return suppressed;
    }
  } catch (err) {
    // Fail-open: if quiet hours check fails, don't suppress
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.notification.router.quiet_hours_check_error",
        userId,
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
 * Step 1 — Resolve preferences (DB query + Redis cache; catalog defaults on error)
 * Step 2 — Apply priority rules (system-critical overrides all channels to enabled)
 * Step 2.5 — Quiet hours check (suppress push+email for non-system-critical during quiet hours)
 * Step 3 — Noise guard (atomic Redis SET NX EX; fail-open if Redis down)
 * Step 4 — Channel decision (omitted payload = skip that channel)
 * Step 5 — Dispatch via Promise.allSettled (channel failures are independent)
 */
export async function dispatchNotification(options: DispatchOptions): Promise<void> {
  const { userId, eventType, content, dedupKey, emailJob, pushPayload, throttleKey } = options;

  // ── Step 1: Resolve preferences ─────────────────────────────────────────
  let channels = await resolveChannels(userId, eventType);

  // ── Step 2: Apply priority rules ─────────────────────────────────────────
  channels = applyPriorityRules(eventType, channels);

  // ── Step 2.5: Quiet hours check ───────────────────────────────────────────
  channels = await applyQuietHours(userId, eventType, channels);

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
