// NOTE: No "server-only" — redis.ts is used by both Next.js server code and
// the standalone realtime server (same pattern as community app's lib/redis.ts)
import type { Redis } from "ioredis";

let redisClient: Redis | null = null;

/**
 * Initialize the Redis client for @igbo/auth.
 * Must be called once at app startup before any auth operations.
 *
 * Community app wires this in instrumentation.ts or app startup:
 *   import { initAuthRedis } from "@igbo/auth";
 *   import { getRedisClient } from "@/lib/redis";
 *   initAuthRedis(getRedisClient());
 */
export function initAuthRedis(client: Redis): void {
  redisClient = client;
}

/**
 * Get the initialized Redis client.
 * Throws if initAuthRedis() was not called first.
 */
export function getAuthRedis(): Redis {
  if (!redisClient) {
    throw new Error("Auth Redis not initialized. Call initAuthRedis() at app startup.");
  }
  return redisClient;
}

/** Reset the Redis client (for testing). */
export function _resetAuthRedis(): void {
  redisClient = null;
}
