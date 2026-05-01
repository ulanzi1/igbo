import "server-only";
import webpush from "web-push";
import {
  getUserPushSubscriptions,
  deletePushSubscriptionByEndpoint,
} from "@igbo/db/queries/push-subscriptions";
import { getRedisClient } from "@/lib/redis";
import { createRedisKey } from "@igbo/config/redis";

/** Retry delays for transient push failures: 2s, then 10s. */
const PUSH_RETRY_DELAYS_MS = [2000, 10000] as const;

/** Test-friendly delay using setTimeout (interceptable by vi.useFakeTimers). */
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface PortalPushPayload {
  title: string;
  body: string;
  link: string;
  tag?: string;
}

/**
 * Lazily configures VAPID at first-call time (process.env may not be available
 * at module-load time in test environments). Subsequent calls are no-ops.
 *
 * Returns true when VAPID is fully configured and push can be sent.
 * Returns false (with a warning) when keys are missing.
 */
let _vapidReady = false;

export function _resetVapidForTests(): void {
  _vapidReady = false;
}

function ensureVapidConfigured(): boolean {
  if (_vapidReady) return true;

  const contact = process.env.VAPID_CONTACT_EMAIL; // ci-allow-process-env
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; // ci-allow-process-env
  const privateKey = process.env.VAPID_PRIVATE_KEY; // ci-allow-process-env

  if (!contact || !publicKey || !privateKey) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.push-service.vapid_not_configured",
        hint: "Set VAPID_CONTACT_EMAIL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY to enable push",
      }),
    );
    return false;
  }

  try {
    webpush.setVapidDetails(contact, publicKey, privateKey);
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.push-service.vapid_init.error",
        error: String(err),
      }),
    );
    return false;
  }
  _vapidReady = true;
  return true;
}

/**
 * Sends to a single push subscription with retry on transient errors.
 * - 410/404: subscription permanently invalid — deletes it, no retry, returns "cleaned"
 * - 400/401/403: VAPID misconfiguration — no retry, returns "failed"
 * - Other errors: transient — retries up to PUSH_RETRY_DELAYS_MS.length times
 * - All retries exhausted: logs retries_exhausted, returns "failed"
 */
async function sendToSubscriptionWithRetry(
  pushSub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadStr: string,
): Promise<"sent" | "cleaned" | "failed"> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= PUSH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await webpush.sendNotification(pushSub, payloadStr);
      return "sent";
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;

      // 410/404: token permanently invalid — clean up immediately, no retry
      if (statusCode === 410 || statusCode === 404) {
        try {
          await deletePushSubscriptionByEndpoint(pushSub.endpoint);
        } catch (cleanupErr: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.push-service.cleanup.error",
              endpoint: pushSub.endpoint,
              error: String(cleanupErr),
            }),
          );
        }
        return "cleaned";
      }

      // 400/401/403: VAPID misconfiguration — permanent, don't retry
      if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.push-service.vapid_misconfiguration",
            statusCode,
            hint: "Check VAPID key configuration",
            error: String(err),
          }),
        );
        return "failed";
      }

      // Transient error — schedule retry with backoff
      lastError = err;
      if (attempt < PUSH_RETRY_DELAYS_MS.length) {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.push-service.send.retry",
            endpoint: pushSub.endpoint,
            attempt: attempt + 1,
            nextDelayMs: PUSH_RETRY_DELAYS_MS[attempt],
            error: String(err),
          }),
        );
        await delay(PUSH_RETRY_DELAYS_MS[attempt]!);
      }
    }
  }

  // All retries exhausted for this subscription
  console.error(
    JSON.stringify({
      level: "error",
      message: "portal.push-service.send.retries_exhausted",
      endpoint: pushSub.endpoint,
      totalAttempts: PUSH_RETRY_DELAYS_MS.length + 1,
      error: String(lastError),
    }),
  );
  return "failed";
}

/**
 * Sends a push notification to all active subscriptions for a user.
 * Fire-and-forget — never throws. Retries transient failures (2s, 10s backoff).
 * Cleans up invalid subscriptions (410/404) without retrying.
 *
 * Includes Redis NX dedup when `tag` is defined to prevent duplicate sends on
 * event replay. Returns true when at least one subscription was sent to,
 * false when deduped or no subscription succeeded.
 * Fail-open: if Redis is unavailable, proceeds with the send.
 */
export async function sendPushNotification(
  userId: string,
  payload: PortalPushPayload,
): Promise<boolean> {
  if (!ensureVapidConfigured()) return false;

  // Redis NX dedup — only when tag is defined (tag is the natural dedup key)
  if (payload.tag !== undefined) {
    try {
      const redis = getRedisClient();
      const dedupKey = createRedisKey("portal", "dedup", `push:${userId}:${payload.tag}`);
      const acquired = await redis.set(dedupKey, "1", "EX", 15 * 60, "NX");
      if (acquired === null) {
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.push-service.dedup_skipped",
            userId,
            tag: payload.tag,
          }),
        );
        return false;
      }
    } catch (redisErr: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.push-service.dedup_check.error",
          userId,
          tag: payload.tag,
          error: String(redisErr),
        }),
      );
      // Fail-open — proceed with send
    }
  }

  let subscriptions: Awaited<ReturnType<typeof getUserPushSubscriptions>>;
  try {
    subscriptions = await getUserPushSubscriptions(userId);
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.push-service.get_subscriptions.error",
        userId,
        error: String(err),
      }),
    );
    return false;
  }
  if (subscriptions.length === 0) return false;

  let anySent = false;
  for (const sub of subscriptions) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys_p256dh,
        auth: sub.keys_auth,
      },
    };
    const result = await sendToSubscriptionWithRetry(pushSub, JSON.stringify(payload));
    if (result === "sent") anySent = true;
  }
  return anySent;
}
