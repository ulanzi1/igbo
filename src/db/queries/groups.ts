// NOTE: No "server-only" — consistent with follows.ts and block-mute.ts pattern
import { and, eq, ilike, inArray, lt, desc, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communityGroups,
  communityGroupMembers,
  type CommunityGroup,
  type GroupVisibility,
  type GroupJoinType,
  type GroupPostingPermission,
  type GroupCommentingPermission,
  type GroupMemberRole,
  type GroupMemberStatus,
} from "@/db/schema/community-groups";
import { communityProfiles } from "@/db/schema/community-profiles";
import { authUsers } from "@/db/schema/auth-users";

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface GroupListItem {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  visibility: GroupVisibility;
  joinType: GroupJoinType;
  memberCount: number;
  creatorId: string;
  createdAt: string; // ISO 8601 — used as cursor
}

export interface DirectoryGroupItem extends GroupListItem {
  memberLimit: number | null;
}

export interface GroupDetail extends GroupListItem {
  postingPermission: GroupPostingPermission;
  commentingPermission: GroupCommentingPermission;
  memberLimit: number | null;
  updatedAt: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string | null;
  bannerUrl?: string | null;
  visibility: GroupVisibility;
  joinType: GroupJoinType;
  postingPermission: GroupPostingPermission;
  commentingPermission: GroupCommentingPermission;
  memberLimit?: number | null;
  creatorId: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  bannerUrl?: string | null;
  visibility?: GroupVisibility;
  joinType?: GroupJoinType;
  postingPermission?: GroupPostingPermission;
  commentingPermission?: GroupCommentingPermission;
  memberLimit?: number | null;
}

export interface GroupListParams {
  cursor?: string;
  limit?: number;
  nameFilter?: string;
}

export interface DirectoryListParams extends GroupListParams {
  visibilityFilter?: GroupVisibility[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Escape SQL LIKE/ILIKE wildcard characters so user input is treated literally. */
function escapeLikePattern(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Create a group and add the creator as a member in a single transaction.
 * Sets member_count to 1 since the creator is the first member.
 */
export async function createGroup(input: CreateGroupInput): Promise<CommunityGroup> {
  const group = await db.transaction(async (tx) => {
    const [newGroup] = await tx
      .insert(communityGroups)
      .values({
        name: input.name,
        description: input.description ?? null,
        bannerUrl: input.bannerUrl ?? null,
        visibility: input.visibility,
        joinType: input.joinType,
        postingPermission: input.postingPermission,
        commentingPermission: input.commentingPermission,
        memberLimit: input.memberLimit ?? null,
        creatorId: input.creatorId,
        memberCount: 1,
      })
      .returning();

    if (!newGroup) throw new Error("Failed to insert community group");

    await tx.insert(communityGroupMembers).values({
      groupId: newGroup.id,
      userId: input.creatorId,
      role: "creator",
      status: "active",
    });

    return newGroup;
  });

  return group;
}

/** Get a group by ID (excludes soft-deleted groups). */
export async function getGroupById(groupId: string): Promise<CommunityGroup | null> {
  const [group] = await db
    .select()
    .from(communityGroups)
    .where(and(eq(communityGroups.id, groupId), sql`${communityGroups.deletedAt} IS NULL`))
    .limit(1);
  return group ?? null;
}

/** Update group fields. Returns updated group or null if not found / deleted. */
export async function updateGroup(
  groupId: string,
  input: UpdateGroupInput,
): Promise<CommunityGroup | null> {
  const updateValues: Record<string, unknown> = {};
  if (input.name !== undefined) updateValues.name = input.name;
  if (input.description !== undefined) updateValues.description = input.description;
  if (input.bannerUrl !== undefined) updateValues.bannerUrl = input.bannerUrl;
  if (input.visibility !== undefined) updateValues.visibility = input.visibility;
  if (input.joinType !== undefined) updateValues.joinType = input.joinType;
  if (input.postingPermission !== undefined)
    updateValues.postingPermission = input.postingPermission;
  if (input.commentingPermission !== undefined)
    updateValues.commentingPermission = input.commentingPermission;
  if (input.memberLimit !== undefined) updateValues.memberLimit = input.memberLimit;
  updateValues.updatedAt = new Date();

  const [group] = await db
    .update(communityGroups)
    .set(updateValues)
    .where(and(eq(communityGroups.id, groupId), sql`${communityGroups.deletedAt} IS NULL`))
    .returning();
  return group ?? null;
}

/** Add a member to a group. No-ops if already a member. Increments member_count atomically. */
export async function addGroupMember(
  groupId: string,
  userId: string,
  role: GroupMemberRole = "member",
): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx
      .insert(communityGroupMembers)
      .values({ groupId, userId, role, status: "active" })
      .onConflictDoNothing()
      .returning();

    // Only increment count if a row was actually inserted (not a conflict no-op)
    if (result.length > 0) {
      await tx
        .update(communityGroups)
        .set({ memberCount: sql`${communityGroups.memberCount} + 1` })
        .where(eq(communityGroups.id, groupId));
    }
  });
}

/**
 * Get a member's role and status within a group.
 * Returns null if the user is not a member.
 */
export async function getGroupMember(
  groupId: string,
  userId: string,
): Promise<{ role: GroupMemberRole; status: GroupMemberStatus } | null> {
  const [row] = await db
    .select({ role: communityGroupMembers.role, status: communityGroupMembers.status })
    .from(communityGroupMembers)
    .where(
      and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * List public groups (cursor-based pagination, ordered newest-first).
 * Only returns non-deleted groups with public visibility.
 */
export async function listGroups(params: GroupListParams = {}): Promise<GroupListItem[]> {
  const { cursor, limit = 20, nameFilter } = params;
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const rows = await db
    .select({
      id: communityGroups.id,
      name: communityGroups.name,
      description: communityGroups.description,
      bannerUrl: communityGroups.bannerUrl,
      visibility: communityGroups.visibility,
      joinType: communityGroups.joinType,
      memberCount: communityGroups.memberCount,
      creatorId: communityGroups.creatorId,
      createdAt: communityGroups.createdAt,
    })
    .from(communityGroups)
    .where(
      and(
        eq(communityGroups.visibility, "public"),
        sql`${communityGroups.deletedAt} IS NULL`,
        nameFilter ? ilike(communityGroups.name, `%${escapeLikePattern(nameFilter)}%`) : undefined,
        cursorDate ? lt(communityGroups.createdAt, cursorDate) : undefined,
      ),
    )
    .orderBy(desc(communityGroups.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ─── Story 5.2 Additions ──────────────────────────────────────────────────────

/**
 * Count how many groups a user is an active member of (excluding soft-deleted groups).
 */
export async function countActiveGroupsForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communityGroupMembers)
    .innerJoin(communityGroups, eq(communityGroupMembers.groupId, communityGroups.id))
    .where(
      and(
        eq(communityGroupMembers.userId, userId),
        eq(communityGroupMembers.status, "active"),
        sql`${communityGroups.deletedAt} IS NULL`,
      ),
    );
  return row?.count ?? 0;
}

/**
 * Insert a group member with explicit status ("active" or "pending").
 * If status is "active", atomically increments member_count.
 * Uses onConflictDoNothing for idempotency.
 */
export async function insertGroupMember(
  groupId: string,
  userId: string,
  role: GroupMemberRole,
  status: GroupMemberStatus,
): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx
      .insert(communityGroupMembers)
      .values({ groupId, userId, role, status })
      .onConflictDoNothing()
      .returning();

    if (result.length > 0 && status === "active") {
      await tx
        .update(communityGroups)
        .set({ memberCount: sql`${communityGroups.memberCount} + 1` })
        .where(eq(communityGroups.id, groupId));
    }
  });
}

/**
 * Update a group member's status. Adjusts member_count atomically:
 * - Transitioning TO "active" → increment
 * - Transitioning FROM "active" → decrement (with GREATEST guard)
 *
 * The existing status is read inside the transaction to avoid TOCTOU races.
 */
export async function updateGroupMemberStatus(
  groupId: string,
  userId: string,
  newStatus: GroupMemberStatus,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: communityGroupMembers.status })
      .from(communityGroupMembers)
      .where(
        and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
      )
      .limit(1);

    if (!existing) return;

    await tx
      .update(communityGroupMembers)
      .set({ status: newStatus })
      .where(
        and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
      );

    if (existing.status !== "active" && newStatus === "active") {
      await tx
        .update(communityGroups)
        .set({ memberCount: sql`${communityGroups.memberCount} + 1` })
        .where(eq(communityGroups.id, groupId));
    } else if (existing.status === "active" && newStatus !== "active") {
      await tx
        .update(communityGroups)
        .set({ memberCount: sql`GREATEST(${communityGroups.memberCount} - 1, 0)` })
        .where(eq(communityGroups.id, groupId));
    }
  });
}

/**
 * Remove a group member entirely. Decrements member_count with GREATEST guard.
 *
 * The existing status is read inside the transaction to avoid TOCTOU races.
 */
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: communityGroupMembers.status })
      .from(communityGroupMembers)
      .where(
        and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
      )
      .limit(1);

    if (!existing) return;

    await tx
      .delete(communityGroupMembers)
      .where(
        and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
      );

    if (existing.status === "active") {
      await tx
        .update(communityGroups)
        .set({ memberCount: sql`GREATEST(${communityGroups.memberCount} - 1, 0)` })
        .where(eq(communityGroups.id, groupId));
    }
  });
}

/**
 * List user IDs of group leaders (role = 'creator' or 'leader', status = 'active').
 */
export async function listGroupLeaders(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: communityGroupMembers.userId })
    .from(communityGroupMembers)
    .where(
      and(
        eq(communityGroupMembers.groupId, groupId),
        inArray(communityGroupMembers.role, ["creator", "leader"]),
        eq(communityGroupMembers.status, "active"),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * List groups for the directory (includes public and private, excludes hidden).
 * Cursor-based pagination, ordered newest-first.
 */
export async function listGroupsForDirectory(
  params: DirectoryListParams = {},
): Promise<DirectoryGroupItem[]> {
  const { cursor, limit = 20, nameFilter, visibilityFilter } = params;
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const visibilities = visibilityFilter ?? ["public", "private"];

  const rows = await db
    .select({
      id: communityGroups.id,
      name: communityGroups.name,
      description: communityGroups.description,
      bannerUrl: communityGroups.bannerUrl,
      visibility: communityGroups.visibility,
      joinType: communityGroups.joinType,
      memberCount: communityGroups.memberCount,
      creatorId: communityGroups.creatorId,
      createdAt: communityGroups.createdAt,
      memberLimit: communityGroups.memberLimit,
    })
    .from(communityGroups)
    .where(
      and(
        inArray(communityGroups.visibility, visibilities),
        sql`${communityGroups.deletedAt} IS NULL`,
        nameFilter ? ilike(communityGroups.name, `%${escapeLikePattern(nameFilter)}%`) : undefined,
        cursorDate ? lt(communityGroups.createdAt, cursorDate) : undefined,
      ),
    )
    .orderBy(desc(communityGroups.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Get pending members for a group (for leader approval UI).
 * Joins community_profiles to include the member's display name.
 */
export async function listPendingMembers(
  groupId: string,
): Promise<Array<{ userId: string; joinedAt: Date; displayName: string | null }>> {
  return db
    .select({
      userId: communityGroupMembers.userId,
      joinedAt: communityGroupMembers.joinedAt,
      displayName: communityProfiles.displayName,
    })
    .from(communityGroupMembers)
    .leftJoin(communityProfiles, eq(communityProfiles.userId, communityGroupMembers.userId))
    .where(
      and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.status, "pending")),
    )
    .orderBy(communityGroupMembers.joinedAt);
}

export interface GroupMemberItem {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  role: GroupMemberRole;
  joinedAt: Date;
  mutedUntil: Date | null;
}

/**
 * List active members of a group with profile info. Cursor-paginated by joinedAt.
 */
export async function listActiveGroupMembers(
  groupId: string,
  cursor?: string,
  limit = 50,
): Promise<GroupMemberItem[]> {
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const rows = await db
    .select({
      userId: communityGroupMembers.userId,
      displayName: communityProfiles.displayName,
      photoUrl: communityProfiles.photoUrl,
      role: communityGroupMembers.role,
      joinedAt: communityGroupMembers.joinedAt,
      mutedUntil: communityGroupMembers.mutedUntil,
    })
    .from(communityGroupMembers)
    .innerJoin(communityProfiles, eq(communityProfiles.userId, communityGroupMembers.userId))
    .where(
      and(
        eq(communityGroupMembers.groupId, groupId),
        eq(communityGroupMembers.status, "active"),
        cursorDate ? gt(communityGroupMembers.joinedAt, cursorDate) : undefined,
      ),
    )
    .orderBy(communityGroupMembers.joinedAt)
    .limit(limit);

  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    photoUrl: r.photoUrl ?? null,
    role: r.role,
    joinedAt: r.joinedAt,
    mutedUntil: r.mutedUntil ?? null,
  }));
}

/**
 * Get a user's platform role (for admin checks).
 */
export async function getUserPlatformRole(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return row?.role ?? null;
}

/**
 * Soft-delete a group by setting deleted_at.
 */
export async function softDeleteGroup(groupId: string): Promise<void> {
  await db
    .update(communityGroups)
    .set({ deletedAt: new Date() })
    .where(eq(communityGroups.id, groupId));
}

/**
 * Get a group by ID even if soft-deleted (for archival read access).
 */
export async function getGroupByIdIncludeArchived(groupId: string): Promise<CommunityGroup | null> {
  const [group] = await db
    .select()
    .from(communityGroups)
    .where(eq(communityGroups.id, groupId))
    .limit(1);
  return group ?? null;
}

/**
 * Update a group member's muted_until timestamp.
 * Set to null to unmute; set to a future date to mute.
 */
export async function updateGroupMemberMutedUntil(
  groupId: string,
  userId: string,
  mutedUntil: Date | null,
): Promise<void> {
  await db
    .update(communityGroupMembers)
    .set({ mutedUntil })
    .where(
      and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
    );
}

/**
 * Get a member's full membership row including muted_until.
 */
export async function getGroupMemberFull(
  groupId: string,
  userId: string,
): Promise<{ role: GroupMemberRole; status: GroupMemberStatus; mutedUntil: Date | null } | null> {
  const [row] = await db
    .select({
      role: communityGroupMembers.role,
      status: communityGroupMembers.status,
      mutedUntil: communityGroupMembers.mutedUntil,
    })
    .from(communityGroupMembers)
    .where(
      and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Update a group member's role.
 */
export async function updateGroupMemberRole(
  groupId: string,
  userId: string,
  newRole: GroupMemberRole,
): Promise<void> {
  await db
    .update(communityGroupMembers)
    .set({ role: newRole })
    .where(
      and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.userId, userId)),
    );
}

/**
 * Get the earliest active member (by joinedAt) for a group, excluding the current creator.
 * Used for ownership transfer: first checks leaders, then members.
 */
export async function findEarliestActiveLeader(
  groupId: string,
  excludeUserId: string,
): Promise<{ userId: string; joinedAt: Date } | null> {
  const [row] = await db
    .select({ userId: communityGroupMembers.userId, joinedAt: communityGroupMembers.joinedAt })
    .from(communityGroupMembers)
    .where(
      and(
        eq(communityGroupMembers.groupId, groupId),
        eq(communityGroupMembers.role, "leader"),
        eq(communityGroupMembers.status, "active"),
        sql`${communityGroupMembers.userId} != ${excludeUserId}`,
      ),
    )
    .orderBy(communityGroupMembers.joinedAt)
    .limit(1);
  return row ?? null;
}

/**
 * Get the earliest active member (by joinedAt) for a group, any role, excluding a user.
 * Used as fallback for ownership transfer when no leaders exist.
 */
export async function findEarliestActiveMember(
  groupId: string,
  excludeUserId: string,
): Promise<{ userId: string; joinedAt: Date } | null> {
  const [row] = await db
    .select({ userId: communityGroupMembers.userId, joinedAt: communityGroupMembers.joinedAt })
    .from(communityGroupMembers)
    .where(
      and(
        eq(communityGroupMembers.groupId, groupId),
        eq(communityGroupMembers.status, "active"),
        sql`${communityGroupMembers.userId} != ${excludeUserId}`,
      ),
    )
    .orderBy(communityGroupMembers.joinedAt)
    .limit(1);
  return row ?? null;
}

/**
 * Batch-fetch viewer's memberships for a list of group IDs.
 * Returns a map of groupId → { role, status }.
 */
export async function batchGetGroupMemberships(
  userId: string,
  groupIds: string[],
): Promise<Record<string, { role: GroupMemberRole; status: GroupMemberStatus }>> {
  if (groupIds.length === 0) return {};

  const rows = await db
    .select({
      groupId: communityGroupMembers.groupId,
      role: communityGroupMembers.role,
      status: communityGroupMembers.status,
    })
    .from(communityGroupMembers)
    .where(
      and(
        eq(communityGroupMembers.userId, userId),
        inArray(communityGroupMembers.groupId, groupIds),
      ),
    );

  const result: Record<string, { role: GroupMemberRole; status: GroupMemberStatus }> = {};
  for (const row of rows) {
    result[row.groupId] = { role: row.role, status: row.status };
  }
  return result;
}
