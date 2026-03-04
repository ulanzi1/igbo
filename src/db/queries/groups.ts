// NOTE: No "server-only" — consistent with follows.ts and block-mute.ts pattern
import { and, eq, ilike, lt, desc, sql } from "drizzle-orm";
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
