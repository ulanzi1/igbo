// NOTE: No "server-only" — matches redis.ts convention (runs in both Next.js and standalone contexts)
import { getRedisClient } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Registry state
// ---------------------------------------------------------------------------

const registry = new Map<string, string[]>();

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Registers a cache namespace (group) with its SCAN patterns.
 *
 * Idempotent when called with the same group+patterns (safe for test re-imports).
 * Throws when the same group is registered with different patterns (catches naming collisions).
 */
export function registerCacheNamespace(group: string, config: { patterns: string[] }): void {
  const existing = registry.get(group);
  if (existing) {
    const sortedExisting = [...existing].sort();
    const sortedNew = [...config.patterns].sort();
    if (
      sortedExisting.length === sortedNew.length &&
      sortedExisting.every((v, i) => v === sortedNew[i])
    ) {
      return; // idempotent — same patterns
    }
    throw new Error(
      `Cache group "${group}" is already registered with different patterns. ` +
        `Existing: [${existing.join(", ")}], New: [${config.patterns.join(", ")}]`,
    );
  }
  registry.set(group, config.patterns);
}

/**
 * Returns the names of all registered cache groups.
 */
export function getRegisteredGroups(): string[] {
  return Array.from(registry.keys());
}

// ---------------------------------------------------------------------------
// Cached fetch
// ---------------------------------------------------------------------------

/**
 * Generic get-or-fetch with Redis caching.
 *
 * Reads from Redis cache; on miss fetches from DB and writes to cache fire-and-forget.
 * On JSON.parse failure (corrupted cache), best-effort eviction so the bad key stops
 * re-poisoning subsequent requests until TTL expires.
 *
 * Throws if the group has not been registered (definite bug — catches typos at dev time).
 */
export async function cachedFetch<T>(
  group: string,
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  if (!registry.has(group)) {
    throw new Error(
      `Cache group "${group}" is not registered. Call registerCacheNamespace() first.`,
    );
  }

  const redis = getRedisClient();
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "portal.cache-registry.cache-parse-error",
          group,
          key,
          error: (err as Error).message,
        }),
      );
      // Best-effort eviction so the corrupted key stops re-poisoning.
      redis.del(key).catch(() => {
        // Swallow: worst case the key expires within its TTL.
      });
      // Fall through to DB path.
    }
  }

  const data = await fetchFn();
  redis.set(key, JSON.stringify(data), "EX", ttl, "NX").catch((err: Error) => {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.cache-registry.cache-write-error",
        group,
        key,
        error: err.message,
      }),
    );
  });
  return data;
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

let _invalidationResolvers: Array<() => void> = [];

function _notifyInvalidationComplete() {
  const resolvers = _invalidationResolvers;
  _invalidationResolvers = [];
  for (const resolve of resolvers) {
    resolve();
  }
}

/**
 * Invalidates cached keys for the specified groups using SCAN-based deletion.
 *
 * Lenient: warns and skips unknown groups (fire-and-forget safety during deploys).
 * Errors are logged and swallowed — the function always resolves.
 */
export async function invalidateByGroup(...groups: string[]): Promise<void> {
  try {
    const redis = getRedisClient();

    for (const group of groups) {
      const patterns = registry.get(group);
      if (!patterns) {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.cache-registry.unknown-group",
            group,
          }),
        );
        continue;
      }

      for (const pattern of patterns) {
        let cursor = "0";
        const keysToDelete: string[] = [];

        do {
          const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
          cursor = nextCursor;
          keysToDelete.push(...keys);
        } while (cursor !== "0");

        if (keysToDelete.length > 0) {
          for (let i = 0; i < keysToDelete.length; i += 100) {
            const batch = keysToDelete.slice(i, i + 100);
            await redis.del(...batch);
          }
        }
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.cache-registry.invalidation-error",
        error: (err as Error).message,
      }),
    );
  } finally {
    _notifyInvalidationComplete();
  }
}

/**
 * Invalidates all registered cache groups.
 */
export async function invalidateAll(): Promise<void> {
  await invalidateByGroup(...Array.from(registry.keys()));
}

// ---------------------------------------------------------------------------
// Test-only hooks
// ---------------------------------------------------------------------------

function _assertNotProduction(name: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name}() must not be called in production — it is a test-only hook.`);
  }
}

/**
 * Test-only hook: resolves when the next invalidation completes.
 * Throws in production.
 */
export function _testOnly_awaitInvalidation(): Promise<void> {
  _assertNotProduction("_testOnly_awaitInvalidation");
  return new Promise((resolve) => {
    _invalidationResolvers.push(resolve);
  });
}

/**
 * Test-only hook: clears the registry. Throws in production.
 */
export function _resetRegistry(): void {
  _assertNotProduction("_resetRegistry");
  registry.clear();
}
