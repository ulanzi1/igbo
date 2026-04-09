// NOTE: No "server-only" — redis.ts is used by both Next.js server code and
// the standalone realtime server (same pattern as community app's lib/redis.ts)
import type { Redis } from "ioredis";

// Use globalThis to survive Next.js Turbopack hot-reload.
// Module-level `let` variables are reset on hot-reload, but globalThis persists
// for the entire Node.js process lifetime — same pattern as community event-bus.ts.
const _global = globalThis as unknown as { __igboAuthRedis?: Redis | null };

/**
 * Initialize the Redis client for @igbo/auth.
 * Preferred — reuses the app's existing connection pool.
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
 * Get the Redis client for @igbo/auth.
 * If initAuthRedis() was never called (e.g. instrumentation hook silently skipped),
 * falls back to lazy-initializing a client directly from REDIS_URL so auth
 * operations are never blocked by a startup ordering issue.
 */
export function getAuthRedis(): Redis {
  if (!_global.__igboAuthRedis) {
    const url = process.env.REDIS_URL; // ci-allow-process-env
    if (!url) {
      throw new Error(
        "Auth Redis not initialized: REDIS_URL is not set. " +
          "Either call initAuthRedis() at app startup or set the REDIS_URL env var.",
      );
    }
    // require() used intentionally — this is a fallback path when the ESM dynamic
    // import in instrumentation.ts did not run. ioredis CJS default export is the class.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RedisClass = require("ioredis") as unknown as new (url: string, opts: object) => Redis;
    _global.__igboAuthRedis = new RedisClass(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      connectionName: "igbo:auth-fallback",
    });
    console.warn(
      JSON.stringify({
        level: "warn",
        message:
          "auth_redis.lazy_init: initAuthRedis() was not called at startup; " +
          "using fallback Redis client. Check instrumentation.ts register().",
      }),
    );
  }
  return _global.__igboAuthRedis;
}

/** Reset the Redis client (for testing). */
export function _resetAuthRedis(): void {
  _global.__igboAuthRedis = null;
}
