// NOTE: No "server-only" — redis.ts is used by both Next.js server code and
// the standalone realtime server (same pattern as community app's lib/redis.ts)
import type { Redis } from "ioredis";

// Use globalThis to survive Next.js Turbopack hot-reload.
// Module-level `let` variables are reset on hot-reload, but globalThis persists
// for the entire Node.js process lifetime — same pattern as community event-bus.ts.
const _global = globalThis as unknown as { __igboAuthRedis?: Redis | null };

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
  _global.__igboAuthRedis = client;
}

/**
 * Get the initialized Redis client.
 * Throws if initAuthRedis() was not called first.
 */
export function getAuthRedis(): Redis {
  const client = _global.__igboAuthRedis;
  if (!client) {
    throw new Error("Auth Redis not initialized. Call initAuthRedis() at app startup.");
  }
  return client;
}

/** Reset the Redis client (for testing). */
export function _resetAuthRedis(): void {
  _global.__igboAuthRedis = null;
}
