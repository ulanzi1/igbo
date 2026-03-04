import "server-only";
import {
  createGroup as dbCreateGroup,
  updateGroup as dbUpdateGroup,
  getGroupById,
  getGroupMember,
  type CreateGroupInput as DbCreateGroupInput,
  type UpdateGroupInput,
  type GroupListItem,
  type GroupDetail,
} from "@/db/queries/groups";
import { canCreateGroup } from "@/services/permissions";
import { eventBus } from "@/services/event-bus";
import type {
  CommunityGroup,
  GroupVisibility,
  GroupJoinType,
  GroupPostingPermission,
  GroupCommentingPermission,
  GroupMemberRole,
} from "@/db/schema/community-groups";

export type { GroupListItem, GroupDetail, UpdateGroupInput };

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateGroupServiceInput {
  name: string;
  description?: string | null;
  bannerUrl?: string | null;
  visibility: GroupVisibility;
  joinType: GroupJoinType;
  postingPermission: GroupPostingPermission;
  commentingPermission: GroupCommentingPermission;
  memberLimit?: number | null;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new group for the given user.
 * Enforces TOP_TIER permission check before creating.
 * Adds the creator as the first member with role "creator".
 * Emits "group.created" EventBus event on success.
 */
export async function createGroupForUser(
  userId: string,
  input: CreateGroupServiceInput,
): Promise<CommunityGroup> {
  const permission = await canCreateGroup(userId);
  if (!permission.allowed) {
    const { ApiError } = await import("@/lib/api-error");
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: permission.reason ?? "Permission denied: group creation requires TOP_TIER membership",
    });
  }

  const dbInput: DbCreateGroupInput = {
    name: input.name,
    description: input.description ?? null,
    bannerUrl: input.bannerUrl ?? null,
    visibility: input.visibility,
    joinType: input.joinType,
    postingPermission: input.postingPermission,
    commentingPermission: input.commentingPermission,
    memberLimit: input.memberLimit ?? null,
    creatorId: userId,
  };

  const group = await dbCreateGroup(dbInput);

  eventBus.emit("group.created", {
    groupId: group.id,
    creatorId: userId,
    timestamp: new Date().toISOString(),
  });

  return group;
}

/**
 * Update group settings. Caller must be the creator or a leader.
 * Emits "group.updated" EventBus event on success.
 */
export async function updateGroupSettings(
  userId: string,
  groupId: string,
  input: UpdateGroupInput,
): Promise<CommunityGroup> {
  const group = await getGroupById(groupId);
  if (!group) {
    const { ApiError } = await import("@/lib/api-error");
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }

  const member = await getGroupMember(groupId, userId);
  const isCreatorOrLeader = member?.role === "creator" || member?.role === "leader";

  if (!isCreatorOrLeader) {
    const { ApiError } = await import("@/lib/api-error");
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only the group creator or leaders can update settings",
    });
  }

  const updated = await dbUpdateGroup(groupId, input);
  if (!updated) {
    const { ApiError } = await import("@/lib/api-error");
    throw new ApiError({
      title: "Internal Server Error",
      status: 500,
      detail: "Failed to update group",
    });
  }

  eventBus.emit("group.updated", {
    groupId,
    updatedBy: userId,
    timestamp: new Date().toISOString(),
  });

  return updated;
}

/**
 * Get group details. Returns null if not found or soft-deleted.
 * Uses member_count column — no N+1.
 */
export async function getGroupDetails(groupId: string): Promise<CommunityGroup | null> {
  return getGroupById(groupId);
}
