import "server-only";
import webpush from "web-push";
import {
  getUserPushSubscriptions,
  deletePushSubscriptionByEndpoint,
} from "@igbo/db/queries/push-subscriptions";

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
 * Sends a push notification to all active subscriptions for a user.
 * Fire-and-forget — never throws. Cleans up invalid subscriptions (410/404).
 */
export async function sendPushNotification(
  userId: string,
  payload: PortalPushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) return;

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
    return;
  }
  if (subscriptions.length === 0) return;

  for (const sub of subscriptions) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys_p256dh,
        auth: sub.keys_auth,
      },
    };

    try {
      await webpush.sendNotification(pushSub, JSON.stringify(payload));
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired or unregistered — clean up
        try {
          await deletePushSubscriptionByEndpoint(sub.endpoint);
        } catch (cleanupErr: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.push-service.cleanup.error",
              endpoint: sub.endpoint,
              error: String(cleanupErr),
            }),
          );
        }
      } else if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.push-service.vapid_misconfiguration",
            statusCode,
            hint: "Check VAPID key configuration",
            error: String(err),
          }),
        );
      } else {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.push-service.send.error",
            userId,
            endpoint: sub.endpoint,
            error: String(err),
          }),
        );
      }
    }
  }
}
