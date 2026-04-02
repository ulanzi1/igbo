import "server-only";
import webpush from "web-push";
import { env } from "@/env";
import {
  getUserPushSubscriptions,
  deletePushSubscriptionByEndpoint,
} from "@igbo/db/queries/push-subscriptions";

export interface PushPayload {
  title: string;
  body: string;
  icon: string;
  link: string;
  tag?: string;
}

// VAPID init guard: only configure if all three vars are present
let vapidConfigured = false;

if (env.VAPID_CONTACT_EMAIL && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    env.VAPID_CONTACT_EMAIL,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
} else {
  console.warn("[push-service] VAPID keys not configured — push notifications disabled");
}

export async function sendPushNotifications(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidConfigured) return;

  const subscriptions = await getUserPushSubscriptions(userId);
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
        await deletePushSubscriptionByEndpoint(sub.endpoint);
      } else {
        console.error("[push-service] sendNotification failed", err);
      }
    }
  }
}
