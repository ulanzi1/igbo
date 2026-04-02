// NOTE: No "server-only" — this is used by both Next.js server code and the standalone realtime server
import { getRedisClient } from "@/lib/redis";
import type { AuthSession } from "@/db/schema/auth-sessions";

const SESSION_CACHE_PREFIX = "session:";

function sessionCacheKey(token: string): string {
  return `${SESSION_CACHE_PREFIX}${token}`;
}

export async function cacheSession(session: AuthSession, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(
      sessionCacheKey(session.sessionToken),
      JSON.stringify(session),
      "EX",
      ttlSeconds,
    );
  } catch {
    // Cache failures must not break session reads — log and continue
    console.warn("[redis.session-cache] write failed — session not cached");
  }
}

export async function getCachedSession(sessionToken: string): Promise<AuthSession | null> {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(sessionCacheKey(sessionToken));
    if (!cached) return null;
    const parsed = JSON.parse(cached) as AuthSession;
    // Rehydrate Date objects from JSON strings
    return {
      ...parsed,
      expires: new Date(parsed.expires),
      lastActiveAt: new Date(parsed.lastActiveAt),
      createdAt: new Date(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

export async function evictCachedSession(sessionToken: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(sessionCacheKey(sessionToken));
  } catch {
    // Eviction failure is non-critical — session will expire from cache naturally
  }
}

export async function evictAllUserSessions(sessionTokens: string[]): Promise<void> {
  if (sessionTokens.length === 0) return;
  try {
    const redis = getRedisClient();
    const keys = sessionTokens.map(sessionCacheKey);
    await redis.del(...keys);
  } catch {
    // Non-critical
  }
}
