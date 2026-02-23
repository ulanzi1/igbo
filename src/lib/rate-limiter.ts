import "server-only";
import { getRedisClient } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 * Each call records one attempt under the given key and returns
 * whether the caller is within the allowed limit for the window.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  // Use a pipeline for atomic multi-step operation
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart); // remove expired entries
  pipeline.zadd(redisKey, now, `${now}-${Math.random().toString(36).slice(2)}`); // record this request
  pipeline.zcount(redisKey, windowStart, "+inf"); // count requests in window
  pipeline.pexpire(redisKey, windowMs); // expire the set after window

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 1;

  const allowed = count <= maxRequests;
  const remaining = Math.max(0, maxRequests - count);

  return { allowed, remaining, resetAt: now + windowMs };
}
