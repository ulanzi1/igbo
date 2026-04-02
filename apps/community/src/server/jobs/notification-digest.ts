import "server-only";
import { registerJob } from "./job-runner";
import { getRedisClient } from "@/lib/redis";
import {
  getUsersInQuietHours,
  getUsersWithDigestDue,
  getNotificationPreferences,
  getUndigestedNotifications,
  markDigestSent,
} from "@igbo/db/queries/notification-preferences";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { enqueueEmailJob } from "@/services/email-service";

registerJob("notification-digest", async () => {
  const now = new Date();
  const redis = getRedisClient();

  // Step 1: Sync DnD Redis keys for users in quiet hours
  // Users IN quiet hours get Redis key set with 90-min TTL (covers hour + buffer)
  // Users OUT of quiet hours: Redis TTL auto-expires their key — no explicit delete needed
  const usersInQh = await getUsersInQuietHours(now);
  for (const userId of usersInQh) {
    await redis.set(`dnd:${userId}`, "1", "EX", 5400); // 90 min TTL
  }

  // Step 2: Send digest emails for users whose digest is due
  const dueUsers = await getUsersWithDigestDue(now);
  for (const { userId, digestTypes } of dueUsers) {
    await sendDigestForUser(userId, digestTypes, now);
  }
});

export async function sendDigestForUser(userId: string, types: string[], now: Date): Promise<void> {
  const prefs = await getNotificationPreferences(userId);
  const allNotifications: Awaited<ReturnType<typeof getUndigestedNotifications>> = [];
  const deliveredTypes: string[] = [];

  for (const type of types) {
    const typePref = prefs[type];
    if (!typePref) continue;
    const since = typePref.lastDigestAt ?? new Date(0);
    const notifications = await getUndigestedNotifications(userId, type, since);
    if (notifications.length > 0) {
      allNotifications.push(...notifications);
      deliveredTypes.push(type);
    }
  }

  if (allNotifications.length === 0) return; // nothing to digest

  const user = await findUserById(userId);
  if (!user?.email) return;
  const locale = user.languagePreference === "ig" ? "ig" : "en";

  await enqueueEmailJob(`digest-${userId}-${Date.now()}`, {
    to: user.email,
    templateId: "notification-digest",
    locale,
    data: { notifications: allNotifications, count: allNotifications.length },
  });

  await markDigestSent(userId, deliveredTypes, now);
}
