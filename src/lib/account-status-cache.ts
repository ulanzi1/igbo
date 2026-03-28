import { getRedisClient } from "@/lib/redis";

const CACHE_PREFIX = "account_status:";
const CACHE_TTL_SECONDS = 30; // Short TTL: admin actions take effect within 30s

export type CachedAccountStatus = {
  accountStatus: string;
  suspensionEndsAt?: string;
  suspensionReason?: string;
};

/**
 * Get cached account status from Redis. Returns null on miss or Redis error.
 * Used by middleware to avoid DB queries on every authenticated request.
 */
export async function getCachedAccountStatus(userId: string): Promise<CachedAccountStatus | null> {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(`${CACHE_PREFIX}${userId}`);
    if (!cached) return null;
    return JSON.parse(cached) as CachedAccountStatus;
  } catch {
    return null;
  }
}

/**
 * Cache account status in Redis. Called after DB lookups to prevent repeat queries.
 */
export async function setCachedAccountStatus(
  userId: string,
  status: CachedAccountStatus,
): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(`${CACHE_PREFIX}${userId}`, JSON.stringify(status), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Non-critical — next request will hit DB
  }
}

/**
 * Invalidate cached status (call when admin changes a user's status).
 */
export async function invalidateCachedAccountStatus(userId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(`${CACHE_PREFIX}${userId}`);
  } catch {
    // Non-critical
  }
}
