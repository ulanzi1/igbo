import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { platformBlockedUsers, platformMutedUsers } from "@/db/schema/platform-social";

// --- Block queries ---

export async function isBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ blockerUserId: platformBlockedUsers.blockerUserId })
    .from(platformBlockedUsers)
    .where(
      and(
        eq(platformBlockedUsers.blockerUserId, blockerUserId),
        eq(platformBlockedUsers.blockedUserId, blockedUserId),
      ),
    )
    .limit(1);
  return !!row;
}

export async function blockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
  await db
    .insert(platformBlockedUsers)
    .values({ blockerUserId, blockedUserId })
    .onConflictDoNothing();
}

export async function unblockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
  await db
    .delete(platformBlockedUsers)
    .where(
      and(
        eq(platformBlockedUsers.blockerUserId, blockerUserId),
        eq(platformBlockedUsers.blockedUserId, blockedUserId),
      ),
    );
}

export async function getBlockedUserIds(blockerUserId: string): Promise<string[]> {
  const rows = await db
    .select({ blockedUserId: platformBlockedUsers.blockedUserId })
    .from(platformBlockedUsers)
    .where(eq(platformBlockedUsers.blockerUserId, blockerUserId));
  return rows.map((r) => r.blockedUserId);
}

// --- Mute queries ---

export async function isMuted(muterUserId: string, mutedUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ muterUserId: platformMutedUsers.muterUserId })
    .from(platformMutedUsers)
    .where(
      and(
        eq(platformMutedUsers.muterUserId, muterUserId),
        eq(platformMutedUsers.mutedUserId, mutedUserId),
      ),
    )
    .limit(1);
  return !!row;
}

export async function muteUser(muterUserId: string, mutedUserId: string): Promise<void> {
  await db.insert(platformMutedUsers).values({ muterUserId, mutedUserId }).onConflictDoNothing();
}

export async function unmuteUser(muterUserId: string, mutedUserId: string): Promise<void> {
  await db
    .delete(platformMutedUsers)
    .where(
      and(
        eq(platformMutedUsers.muterUserId, muterUserId),
        eq(platformMutedUsers.mutedUserId, mutedUserId),
      ),
    );
}

/**
 * Returns all user IDs that have blocked `targetUserId`, used to filter
 * who can receive notifications from `targetUserId`.
 */
export async function getUsersWhoBlocked(targetUserId: string): Promise<string[]> {
  const rows = await db
    .select({ blockerUserId: platformBlockedUsers.blockerUserId })
    .from(platformBlockedUsers)
    .where(eq(platformBlockedUsers.blockedUserId, targetUserId));
  return rows.map((r) => r.blockerUserId);
}

/**
 * Returns all user IDs that have muted `targetUserId`, used to filter
 * who can receive notifications from `targetUserId`.
 */
export async function getUsersWhoMuted(targetUserId: string): Promise<string[]> {
  const rows = await db
    .select({ muterUserId: platformMutedUsers.muterUserId })
    .from(platformMutedUsers)
    .where(eq(platformMutedUsers.mutedUserId, targetUserId));
  return rows.map((r) => r.muterUserId);
}

/**
 * Returns true if any of the provided user IDs are blocked by `userId`
 * (used to filter notification recipients in bulk).
 */
export async function isAnyBlocked(userId: string, otherUserIds: string[]): Promise<boolean> {
  if (otherUserIds.length === 0) return false;
  const [row] = await db
    .select({ blockerUserId: platformBlockedUsers.blockerUserId })
    .from(platformBlockedUsers)
    .where(
      and(
        eq(platformBlockedUsers.blockerUserId, userId),
        inArray(platformBlockedUsers.blockedUserId, otherUserIds),
      ),
    )
    .limit(1);
  return !!row;
}
