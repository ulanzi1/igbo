/**
 * Application namespace for Redis key construction.
 * Adding a third app requires a visible PR diff to this file.
 */
export type RedisApp = "community" | "portal";

/**
 * Functional domain segment for Redis key construction.
 *
 * Core domains (see REDIS_TTL) apply across both apps:
 *   session, cache, dedup, throttle, rate, delivered
 *
 * Portal feature domains are app-specific. Each is listed here with a
 * reference to the service that owns it. Adding a new domain requires
 * a PR diff to this type.
 */
export type RedisDomain =
  // Core TTL domains (see REDIS_TTL)
  | "session"
  | "cache"
  | "dedup"
  | "throttle"
  | "rate"
  | "delivered"
  // Portal feature domains — job-search-service.ts
  | "job-search"
  | "discovery"
  // Portal feature domains — saved-search-service.ts
  | "saved-search-alerted"
  | "saved-search-throttle"
  // Portal feature domains — seeker-analytics-service.ts
  | "profile-view-dedup"
  // Portal feature domains — job-analytics-service.ts
  | "job-view-dedup"
  // Portal feature domains — sitemap.ts
  | "sitemap";

/**
 * Creates a namespaced Redis key following the convention: `{app}:{domain}:{id}`.
 *
 * **Naming convention:**
 * - `app` — application namespace ("community" | "portal")
 * - `domain` — functional domain (e.g., "session", "cache", "dedup", "throttle", "rate", "delivered")
 * - `id` — entity identifier, may contain `:` for sub-segments
 *
 * All Redis key construction in `apps/portal/` and `apps/community/` MUST use this
 * function. The CI scanner (`scripts/ci-checks/check-redis-keys.ts`) enforces this
 * by failing on raw key strings outside `createRedisKey` calls.
 *
 * @example
 * createRedisKey("community", "session", "abc")
 * // => "community:session:abc"
 *
 * createRedisKey("portal", "dedup", `notif:app-submitted:${applicationId}`)
 * // => "portal:dedup:notif:app-submitted:app-123"
 *
 * createRedisKey("portal", "throttle", `msg:${senderId}:${recipientId}:${applicationId}`)
 * // => "portal:throttle:msg:u1:u2:app-123"
 */
export function createRedisKey(app: RedisApp, domain: RedisDomain, id: string): string {
  return `${app}:${domain}:${id}`;
}

/**
 * Domain name constants — parallel to REDIS_TTL.
 *
 * Use these constants when constructing Redis keys with `createRedisKey` to
 * avoid string literal typos and enable IDE autocomplete for the 6 core domains.
 *
 * | Constant              | Value       |
 * |-----------------------|-------------|
 * | REDIS_DOMAIN.session  | "session"   |
 * | REDIS_DOMAIN.cache    | "cache"     |
 * | REDIS_DOMAIN.dedup    | "dedup"     |
 * | REDIS_DOMAIN.throttle | "throttle"  |
 * | REDIS_DOMAIN.rate     | "rate"      |
 * | REDIS_DOMAIN.delivered| "delivered" |
 */
export const REDIS_DOMAIN = {
  /** Auth session cache */
  session: "session",
  /** General query/data cache */
  cache: "cache",
  /** Idempotency / deduplication window */
  dedup: "dedup",
  /** Rate-limit fixed window */
  throttle: "throttle",
  /** Rate-limit sliding window */
  rate: "rate",
  /** Delivery receipt tracking */
  delivered: "delivered",
} as const satisfies Record<string, RedisDomain>;

/**
 * TTL policy per domain (in seconds).
 *
 * These are reference constants — services SHOULD use these values when setting
 * TTLs via `redis.set(..., "EX", TTL)`. The CI scanner does NOT enforce TTL usage,
 * but these constants make TTL policies discoverable and consistent.
 *
 * | Domain     | TTL       | Purpose                                         |
 * |------------|-----------|------------------------------------------------ |
 * | session    | 86400     | Auth session cache (24 hours)                   |
 * | cache      | 600       | General query/data cache (10 minutes)           |
 * | dedup      | 900       | Idempotency / deduplication window (15 minutes) |
 * | throttle   | 30        | Rate-limit fixed window (30 seconds)            |
 * | rate       | 60        | Rate-limit sliding window (60 seconds)          |
 * | delivered  | 86400     | Delivery receipt tracking (24 hours)             |
 */
export const REDIS_TTL = {
  /** Auth session cache — 24 hours */
  session: 86_400,
  /** General query/data cache — 10 minutes */
  cache: 600,
  /** Idempotency / deduplication window — 15 minutes */
  dedup: 900,
  /** Rate-limit fixed window — 30 seconds */
  throttle: 30,
  /** Rate-limit sliding window — 60 seconds */
  rate: 60,
  /** Delivery receipt tracking — 24 hours */
  delivered: 86_400,
} as const;
