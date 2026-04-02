import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { platformPushSubscriptions } from "@/db/schema/platform-push-subscriptions";

export async function upsertPushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await db
    .insert(platformPushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      keysP256dh: sub.keys.p256dh,
      keysAuth: sub.keys.auth,
    })
    .onConflictDoUpdate({
      target: platformPushSubscriptions.endpoint,
      set: {
        keysP256dh: sql`EXCLUDED.keys_p256dh`,
        keysAuth: sql`EXCLUDED.keys_auth`,
        userId: sql`EXCLUDED.user_id`,
      },
    });
}

export async function getUserPushSubscriptions(
  userId: string,
): Promise<Array<{ endpoint: string; keys_p256dh: string; keys_auth: string }>> {
  const rows = await db
    .select({
      endpoint: platformPushSubscriptions.endpoint,
      keys_p256dh: platformPushSubscriptions.keysP256dh,
      keys_auth: platformPushSubscriptions.keysAuth,
    })
    .from(platformPushSubscriptions)
    .where(eq(platformPushSubscriptions.userId, userId));
  return rows;
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db
    .delete(platformPushSubscriptions)
    .where(eq(platformPushSubscriptions.endpoint, endpoint));
}

export async function deleteAllUserPushSubscriptions(userId: string): Promise<void> {
  await db.delete(platformPushSubscriptions).where(eq(platformPushSubscriptions.userId, userId));
}
