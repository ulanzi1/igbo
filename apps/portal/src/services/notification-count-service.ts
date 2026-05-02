import "server-only";
import { getRedisClient } from "@/lib/redis";
import { createRedisKey } from "@igbo/config/redis";
import { getPortalUnreadCount } from "@igbo/db/queries/portal-notifications";

const UNREAD_COUNT_TTL_SECONDS = 60;

/**
 * Get unread notification count with Redis cache.
 * Falls back to DB on cache miss or Redis error (fail-open).
 */
export async function getCachedUnreadCount(userId: string): Promise<number> {
  const key = createRedisKey("portal", "notif-unread", userId);

  try {
    const redis = getRedisClient();
    const cached = await redis.get(key);

    if (cached !== null) {
      const parsed = parseInt(cached, 10);
      if (!isNaN(parsed)) return parsed;
      // Corrupted cache value — fall through to DB
    }

    // Cache miss — fetch from DB and warm cache
    const count = await getPortalUnreadCount(userId);
    redis.set(key, String(count), "EX", UNREAD_COUNT_TTL_SECONDS).catch(() => {});
    return count;
  } catch {
    // Redis error — fall back to DB directly
    return getPortalUnreadCount(userId);
  }
}

/**
 * Invalidate the cached unread count. Called after mutations:
 * mark-read, mark-all-read, dismiss, new notification.
 */
export async function invalidateUnreadCount(userId: string): Promise<void> {
  const key = createRedisKey("portal", "notif-unread", userId);
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch {
    // Fail-open: next read will re-populate from DB
  }
}
