import "server-only";
import {
  createGroup as dbCreateGroup,
  updateGroup as dbUpdateGroup,
  getGroupById,
  getGroupMember,
  updateGroupMemberRole,
  findEarliestActiveLeader,
  findEarliestActiveMember,
  softDeleteGroup,
  getUserPlatformRole,
  type CreateGroupInput as DbCreateGroupInput,
  type UpdateGroupInput,
  type GroupListItem,
  type GroupDetail,
} from "@igbo/db/queries/groups";
import { getUserMembershipTier } from "@igbo/db/queries/auth-permissions";
import { canCreateGroup } from "@igbo/auth/permissions";
import { eventBus } from "@/services/event-bus";
import { createDefaultChannel } from "@/services/group-channel-service";
import {
  listAllChannelConversationIds,
  softDeleteChannelConversation,
} from "@igbo/db/queries/group-channels";
import type {
  CommunityGroup,
  GroupVisibility,
  GroupJoinType,
  GroupPostingPermission,
  GroupCommentingPermission,
  GroupMemberRole,
} from "@igbo/db/schema/community-groups";

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

  // Create the default "General" channel for this group (after group TX completes)
  await createDefaultChannel(group.id, userId);

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

/**
 * Assign a group leader. Only the group creator can do this.
 * Target must be an active member with PROFESSIONAL or TOP_TIER tier.
 * Emits "group.leader_assigned" EventBus event.
 */
export async function assignGroupLeader(
  actorId: string,
  groupId: string,
  targetUserId: string,
): Promise<void> {
  const { ApiError } = await import("@/lib/api-error");

  const group = await getGroupById(groupId);
  if (!group) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }

  // Only the creator can assign leaders
  const actor = await getGroupMember(groupId, actorId);
  if (!actor || actor.role !== "creator") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only the group creator can assign leaders",
    });
  }

  // Target must be an active member with role "member" (not already leader/creator)
  const target = await getGroupMember(groupId, targetUserId);
  if (!target || target.status !== "active") {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "User is not an active member of this group",
    });
  }
  if (target.role !== "member") {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: "User is already a leader or creator",
    });
  }

  // Target must be PROFESSIONAL or TOP_TIER
  const tier = await getUserMembershipTier(targetUserId);
  if (tier !== "PROFESSIONAL" && tier !== "TOP_TIER") {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: "Leader assignment requires Professional or Top-tier membership",
    });
  }

  await updateGroupMemberRole(groupId, targetUserId, "leader");

  eventBus.emit("group.leader_assigned", {
    groupId,
    userId: targetUserId,
    assignedBy: actorId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Transfer group ownership to the next eligible member.
 * Priority: earliest active leader → earliest active member → archive group.
 * Called when creator account is suspended/deleted/anonymized.
 */
export async function transferGroupOwnership(
  groupId: string,
  previousOwnerId: string,
): Promise<void> {
  const { ApiError: _ApiError } = await import("@/lib/api-error");

  // Find earliest active leader (excluding the previous owner)
  const leader = await findEarliestActiveLeader(groupId, previousOwnerId);
  if (leader) {
    await updateGroupMemberRole(groupId, leader.userId, "creator");
    await updateGroupMemberRole(groupId, previousOwnerId, "member");

    eventBus.emit("group.ownership_transferred", {
      groupId,
      previousOwnerId,
      newOwnerId: leader.userId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Find earliest active member (excluding the previous owner)
  const member = await findEarliestActiveMember(groupId, previousOwnerId);
  if (member) {
    await updateGroupMemberRole(groupId, member.userId, "creator");
    await updateGroupMemberRole(groupId, previousOwnerId, "member");

    eventBus.emit("group.ownership_transferred", {
      groupId,
      previousOwnerId,
      newOwnerId: member.userId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // No active members — archive the group
  await archiveGroup("system", groupId);
}

/**
 * Archive a group: sets deleted_at, freezes all channel conversations,
 * and emits the group.archived event.
 * Creator or platform admin only.
 */
export async function archiveGroup(actorId: string, groupId: string): Promise<void> {
  const { ApiError } = await import("@/lib/api-error");

  // Allow "system" actor for automated ownership transfer fallback
  if (actorId !== "system") {
    const group = await getGroupById(groupId);
    if (!group) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
    }

    const actor = await getGroupMember(groupId, actorId);
    if (!actor || actor.role !== "creator") {
      // Check if platform admin
      const platformRole = await getUserPlatformRole(actorId);
      if (platformRole !== "ADMIN") {
        throw new ApiError({
          title: "Forbidden",
          status: 403,
          detail: "Only the group creator or platform admins can archive a group",
        });
      }
    }
  }

  // Soft-delete the group
  await softDeleteGroup(groupId);

  // Freeze all group channel conversations
  const convIds = await listAllChannelConversationIds(groupId);
  await Promise.all(convIds.map((cid) => softDeleteChannelConversation(cid)));

  eventBus.emit("group.archived", {
    groupId,
    archivedBy: actorId,
    timestamp: new Date().toISOString(),
  });
}
