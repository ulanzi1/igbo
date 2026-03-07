// No "server-only" — follows posts.ts / feed.ts pattern (imported by server-only services).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { communityUserBadges } from "@/db/schema/community-badges";
import type { BadgeType } from "@/db/schema/community-badges";
import type { Redis } from "ioredis";

const BADGE_CACHE_KEY = (userId: string) => `badge:user:${userId}`;
const BADGE_CACHE_TTL = 300; // 5 minutes

export async function getUserBadge(
  userId: string,
): Promise<{ badgeType: BadgeType; assignedAt: Date } | null> {
  const [row] = await db
    .select({
      badgeType: communityUserBadges.badgeType,
      assignedAt: communityUserBadges.assignedAt,
    })
    .from(communityUserBadges)
    .where(eq(communityUserBadges.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertUserBadge(
  userId: string,
  badgeType: BadgeType,
  assignedBy: string,
): Promise<void> {
  await db
    .insert(communityUserBadges)
    .values({ userId, badgeType, assignedBy })
    .onConflictDoUpdate({
      target: communityUserBadges.userId,
      set: { badgeType, assignedBy, assignedAt: new Date() },
    });
}

export async function deleteUserBadge(userId: string): Promise<boolean> {
  const rows = await db
    .delete(communityUserBadges)
    .where(eq(communityUserBadges.userId, userId))
    .returning({ userId: communityUserBadges.userId });
  return rows.length > 0;
}

export async function getUserBadgeWithCache(
  userId: string,
  redis: Redis,
): Promise<{ badgeType: BadgeType; assignedAt: Date } | null> {
  const key = BADGE_CACHE_KEY(userId);
  const cached = await redis.get(key);
  if (cached !== null) {
    if (cached === "null" || cached === "") return null;
    try {
      const parsed = JSON.parse(cached) as { badgeType: BadgeType; assignedAt: string };
      return { badgeType: parsed.badgeType, assignedAt: new Date(parsed.assignedAt) };
    } catch {
      // Corrupted cache — fall through to DB
    }
  }
  const result = await getUserBadge(userId);
  await redis.set(key, result === null ? "null" : JSON.stringify(result), "EX", BADGE_CACHE_TTL);
  return result;
}

export async function invalidateBadgeCache(userId: string, redis: Redis): Promise<void> {
  await redis.del(BADGE_CACHE_KEY(userId));
}
