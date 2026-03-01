// NOTE: No "server-only" — follows query patterns may be used by realtime server
import { eq, and, desc, lt, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import { communityMemberFollows } from "@/db/schema/community-connections";
import { communityProfiles } from "@/db/schema/community-profiles";

export interface FollowListMember {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  followedAt: string; // ISO 8601 — used as cursor
}

/** Follow: insert relationship + atomically increment counts in a transaction. */
export async function followMember(followerId: string, followingId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(communityMemberFollows)
      .values({ followerId, followingId })
      .onConflictDoNothing()
      .returning();

    // Only update counts if the row was actually inserted (not a duplicate)
    if (inserted.length === 0) return;

    await tx
      .update(communityProfiles)
      .set({ followingCount: sql`${communityProfiles.followingCount} + 1` })
      .where(eq(communityProfiles.userId, followerId));

    await tx
      .update(communityProfiles)
      .set({ followerCount: sql`${communityProfiles.followerCount} + 1` })
      .where(eq(communityProfiles.userId, followingId));
  });
}

/** Unfollow: delete relationship + atomically decrement counts (floored at 0). */
export async function unfollowMember(followerId: string, followingId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(communityMemberFollows)
      .where(
        and(
          eq(communityMemberFollows.followerId, followerId),
          eq(communityMemberFollows.followingId, followingId),
        ),
      )
      .returning();

    // Only update counts if a row was actually deleted
    if (deleted.length === 0) return;

    await tx
      .update(communityProfiles)
      .set({ followingCount: sql`GREATEST(${communityProfiles.followingCount} - 1, 0)` })
      .where(eq(communityProfiles.userId, followerId));

    await tx
      .update(communityProfiles)
      .set({ followerCount: sql`GREATEST(${communityProfiles.followerCount} - 1, 0)` })
      .where(eq(communityProfiles.userId, followingId));
  });
}

/**
 * Batch check which of the given userIds the followerId is following.
 * Returns a map of { userId → boolean }.
 * Unknown userIds and unrecognised UUIDs return false (no error).
 */
export async function batchIsFollowing(
  followerId: string,
  followingIds: string[],
): Promise<Record<string, boolean>> {
  if (followingIds.length === 0) return {};

  const rows = await db
    .select({ followingId: communityMemberFollows.followingId })
    .from(communityMemberFollows)
    .where(
      and(
        eq(communityMemberFollows.followerId, followerId),
        inArray(communityMemberFollows.followingId, followingIds),
      ),
    );

  const followed = new Set(rows.map((r) => r.followingId));
  return Object.fromEntries(followingIds.map((id) => [id, followed.has(id)]));
}

/** Check if follower is currently following following. */
export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const [row] = await db
    .select({ followerId: communityMemberFollows.followerId })
    .from(communityMemberFollows)
    .where(
      and(
        eq(communityMemberFollows.followerId, followerId),
        eq(communityMemberFollows.followingId, followingId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * List members who follow userId (ordered newest first, cursor = followedAt ISO string).
 * Cursor-based pagination: provide cursor from previous page's last item.
 */
export async function getFollowersPage(
  userId: string,
  cursor?: string,
  limit = 20,
): Promise<FollowListMember[]> {
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const rows = await db
    .select({
      userId: communityProfiles.userId,
      displayName: communityProfiles.displayName,
      photoUrl: communityProfiles.photoUrl,
      locationCity: communityProfiles.locationCity,
      locationCountry: communityProfiles.locationCountry,
      followedAt: communityMemberFollows.createdAt,
    })
    .from(communityMemberFollows)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityMemberFollows.followerId),
        sql`${communityProfiles.deletedAt} IS NULL`,
      ),
    )
    .where(
      cursorDate
        ? and(
            eq(communityMemberFollows.followingId, userId),
            lt(communityMemberFollows.createdAt, cursorDate),
          )
        : eq(communityMemberFollows.followingId, userId),
    )
    .orderBy(desc(communityMemberFollows.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    photoUrl: r.photoUrl,
    locationCity: r.locationCity,
    locationCountry: r.locationCountry,
    followedAt: r.followedAt.toISOString(),
  }));
}

/** List members that userId follows (ordered newest first, cursor = followedAt ISO string). */
export async function getFollowingPage(
  userId: string,
  cursor?: string,
  limit = 20,
): Promise<FollowListMember[]> {
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const rows = await db
    .select({
      userId: communityProfiles.userId,
      displayName: communityProfiles.displayName,
      photoUrl: communityProfiles.photoUrl,
      locationCity: communityProfiles.locationCity,
      locationCountry: communityProfiles.locationCountry,
      followedAt: communityMemberFollows.createdAt,
    })
    .from(communityMemberFollows)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityMemberFollows.followingId),
        sql`${communityProfiles.deletedAt} IS NULL`,
      ),
    )
    .where(
      cursorDate
        ? and(
            eq(communityMemberFollows.followerId, userId),
            lt(communityMemberFollows.createdAt, cursorDate),
          )
        : eq(communityMemberFollows.followerId, userId),
    )
    .orderBy(desc(communityMemberFollows.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    photoUrl: r.photoUrl,
    locationCity: r.locationCity,
    locationCountry: r.locationCountry,
    followedAt: r.followedAt.toISOString(),
  }));
}
