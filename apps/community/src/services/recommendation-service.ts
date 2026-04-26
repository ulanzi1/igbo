import "server-only";
import { getRedisClient } from "@/lib/redis";
import { getRecommendedGroups } from "@igbo/db/queries/recommendations";
import type { RecommendedGroupItem } from "@igbo/db/queries/recommendations";

const CACHE_TTL_SECONDS = 12 * 60 * 60; // 43200

function cacheKey(userId: string): string {
  // community-scope: raw Redis keys — VD-4 trigger not yet reached
  return `recommendations:groups:${userId}`; // ci-allow-redis-key
}

export async function getRecommendedGroupsForUser(userId: string): Promise<RecommendedGroupItem[]> {
  let cached: string | null = null;
  try {
    const redis = getRedisClient();
    cached = await redis.get(cacheKey(userId));
  } catch {
    // Redis read failure — proceed to DB query
  }

  if (cached) {
    return JSON.parse(cached) as RecommendedGroupItem[];
  }

  const results = await getRecommendedGroups(userId, 5);

  try {
    const redis = getRedisClient();
    await redis.set(cacheKey(userId), JSON.stringify(results), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Redis write failure — non-critical, result already obtained
  }

  return results;
}

export async function invalidateRecommendationCache(userId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(cacheKey(userId));
  } catch {
    // Non-critical — cache will expire naturally
  }
}
