import "server-only";
import { ApiError } from "@/lib/api-error";
import {
  getGroupById,
  getGroupMember,
  getGroupMemberFull,
  countActiveGroupsForUser,
  insertGroupMember,
  updateGroupMemberStatus,
  updateGroupMemberMutedUntil,
  removeGroupMember,
  listGroupLeaders,
} from "@igbo/db/queries/groups";
import { logGroupModerationAction } from "@/services/audit-logger";
import {
  getDefaultChannelConversationId,
  listAllChannelConversationIds,
  addMembersToConversation,
} from "@igbo/db/queries/group-channels";
import { db } from "@igbo/db";
import { communityProfiles } from "@igbo/db/schema/community-profiles";
import { eq } from "drizzle-orm";
import { getPlatformSetting } from "@igbo/db/queries/platform-settings";
import { eventBus } from "@/services/event-bus";
import { messageService } from "@/services/message-service";

async function getDisplayName(userId: string): Promise<string> {
  const [row] = await db
    .select({ displayName: communityProfiles.displayName })
    .from(communityProfiles)
    .where(eq(communityProfiles.userId, userId))
    .limit(1);
  return row?.displayName ?? "A member";
}

const DEFAULT_GROUP_MEMBERSHIP_LIMIT = 40;

/**
 * Join an open (public) group immediately.
 */
export async function joinOpenGroup(
  userId: string,
  groupId: string,
): Promise<{ role: string; status: string }> {
  const group = await getGroupById(groupId);
  if (!group) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }
  // Visibility checked before joinType to avoid leaking existence of hidden groups
  if (group.visibility === "hidden") {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }
  if (group.joinType !== "open") {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: "This group requires approval to join",
    });
  }

  // Check existing membership
  const existing = await getGroupMember(groupId, userId);
  if (existing?.status === "active") {
    return { role: existing.role, status: existing.status };
  }
  if (existing?.status === "banned") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "You have been banned from this group",
    });
  }

  // Check group member limit
  if (group.memberLimit !== null && group.memberCount >= group.memberLimit) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: "Group is full",
    });
  }

  // Enforce membership limit
  const limit = await getPlatformSetting<number>(
    "group_membership_limit",
    DEFAULT_GROUP_MEMBERSHIP_LIMIT,
  );
  const currentCount = await countActiveGroupsForUser(userId);
  if (currentCount >= limit) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: `You've reached the maximum of ${limit} groups. Leave a group to join a new one.`,
    });
  }

  await insertGroupMember(groupId, userId, "member", "active");

  // Enroll the new member in all existing channel conversations
  const channelConvIds = await listAllChannelConversationIds(groupId);
  await Promise.all(channelConvIds.map((cid) => addMembersToConversation(cid, [userId])));

  eventBus.emit("group.member_joined", {
    groupId,
    userId,
    timestamp: new Date().toISOString(),
  });

  // System message in General channel (deferred from Story 5.2, completed in 5.3)
  const conversationId = await getDefaultChannelConversationId(groupId);
  if (conversationId) {
    const name = await getDisplayName(userId);
    await messageService.sendSystemMessage(conversationId, userId, `${name} joined the group`);
  }

  return { role: "member", status: "active" };
}

/**
 * Request to join a private (approval-required) group.
 */
export async function requestToJoinGroup(
  userId: string,
  groupId: string,
): Promise<{ status: string }> {
  const group = await getGroupById(groupId);
  if (!group) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }
  // Visibility checked before joinType to avoid leaking existence of hidden groups
  if (group.visibility === "hidden") {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }
  if (group.joinType !== "approval") {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: "This group does not require approval to join",
    });
  }

  // Check existing membership — idempotent
  const existing = await getGroupMember(groupId, userId);
  if (existing?.status === "active") {
    return { status: "active" };
  }
  if (existing?.status === "pending") {
    return { status: "pending" };
  }
  if (existing?.status === "banned") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "You have been banned from this group",
    });
  }

  // Check group member limit
  if (group.memberLimit !== null && group.memberCount >= group.memberLimit) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: "Group is full",
    });
  }

  // Enforce membership limit
  const limit = await getPlatformSetting<number>(
    "group_membership_limit",
    DEFAULT_GROUP_MEMBERSHIP_LIMIT,
  );
  const currentCount = await countActiveGroupsForUser(userId);
  if (currentCount >= limit) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: `You've reached the maximum of ${limit} groups. Leave a group to join a new one.`,
    });
  }

  await insertGroupMember(groupId, userId, "member", "pending");

  eventBus.emit("group.join_requested", {
    groupId,
    userId,
    timestamp: new Date().toISOString(),
  });

  return { status: "pending" };
}

/**
 * Approve a pending join request (leader/creator only).
 */
export async function approveJoinRequest(
  leaderId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  // Verify caller is leader/creator
  const callerMembership = await getGroupMember(groupId, leaderId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can approve requests",
    });
  }

  // Verify target is pending
  const targetMembership = await getGroupMember(groupId, memberId);
  if (!targetMembership || targetMembership.status !== "pending") {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "No pending request found for this user",
    });
  }

  // Re-check membership limit at approval time (race condition guard)
  const limit = await getPlatformSetting<number>(
    "group_membership_limit",
    DEFAULT_GROUP_MEMBERSHIP_LIMIT,
  );
  const currentCount = await countActiveGroupsForUser(memberId);
  if (currentCount >= limit) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: `This member has already joined ${limit} groups and cannot be added to another. Ask them to leave a group first.`,
    });
  }

  await updateGroupMemberStatus(groupId, memberId, "active");

  // Enroll the approved member in all existing channel conversations
  const channelConvIds = await listAllChannelConversationIds(groupId);
  await Promise.all(channelConvIds.map((cid) => addMembersToConversation(cid, [memberId])));

  eventBus.emit("group.join_approved", {
    groupId,
    userId: memberId,
    approvedBy: leaderId,
    timestamp: new Date().toISOString(),
  });

  // System message in General channel
  const conversationId = await getDefaultChannelConversationId(groupId);
  if (conversationId) {
    const name = await getDisplayName(memberId);
    await messageService.sendSystemMessage(conversationId, memberId, `${name} joined the group`);
  }
}

/**
 * Reject a pending join request (leader/creator only).
 */
export async function rejectJoinRequest(
  leaderId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  // Verify caller is leader/creator
  const callerMembership = await getGroupMember(groupId, leaderId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can reject requests",
    });
  }

  // Verify target is pending
  const targetMembership = await getGroupMember(groupId, memberId);
  if (!targetMembership || targetMembership.status !== "pending") {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "No pending request found for this user",
    });
  }

  await removeGroupMember(groupId, memberId);

  eventBus.emit("group.join_rejected", {
    groupId,
    userId: memberId,
    rejectedBy: leaderId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Mute a group member (temporary — can still read but cannot post/comment).
 * Caller must be creator or leader.
 */
export async function muteGroupMember(
  moderatorId: string,
  groupId: string,
  targetUserId: string,
  durationMs: number,
  reason?: string,
): Promise<void> {
  const callerMembership = await getGroupMember(groupId, moderatorId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can mute members",
    });
  }

  const target = await getGroupMember(groupId, targetUserId);
  if (!target || target.status !== "active") {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "User is not an active member of this group",
    });
  }
  if (target.role === "creator") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Cannot mute the group creator",
    });
  }

  const mutedUntil = new Date(Date.now() + durationMs);
  await updateGroupMemberMutedUntil(groupId, targetUserId, mutedUntil);
  await logGroupModerationAction({
    groupId,
    moderatorId,
    targetUserId,
    targetType: "member",
    action: "mute",
    reason: reason ?? null,
    expiresAt: mutedUntil,
  });

  eventBus.emit("group.member_muted", {
    groupId,
    userId: targetUserId,
    moderatorId,
    mutedUntil: mutedUntil.toISOString(),
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Unmute a group member.
 * Caller must be creator or leader.
 */
export async function unmuteGroupMember(
  moderatorId: string,
  groupId: string,
  targetUserId: string,
): Promise<void> {
  const callerMembership = await getGroupMember(groupId, moderatorId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can unmute members",
    });
  }

  const target = await getGroupMemberFull(groupId, targetUserId);
  if (!target) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "User is not a member of this group",
    });
  }

  if (!target.mutedUntil || target.mutedUntil <= new Date()) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Member is not currently muted",
    });
  }

  await updateGroupMemberMutedUntil(groupId, targetUserId, null);
  await logGroupModerationAction({
    groupId,
    moderatorId,
    targetUserId,
    targetType: "member",
    action: "unmute",
  });

  eventBus.emit("group.member_unmuted", {
    groupId,
    userId: targetUserId,
    moderatorId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Ban a group member (removed from group, cannot rejoin without leader approval).
 * Caller must be creator or leader.
 */
export async function banGroupMember(
  moderatorId: string,
  groupId: string,
  targetUserId: string,
  reason?: string,
): Promise<void> {
  const callerMembership = await getGroupMember(groupId, moderatorId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can ban members",
    });
  }

  const target = await getGroupMember(groupId, targetUserId);
  if (!target || target.status !== "active") {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "User is not an active member of this group",
    });
  }
  if (target.role === "creator") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Cannot ban the group creator",
    });
  }

  await updateGroupMemberStatus(groupId, targetUserId, "banned");
  await logGroupModerationAction({
    groupId,
    moderatorId,
    targetUserId,
    targetType: "member",
    action: "ban",
    reason: reason ?? null,
  });

  eventBus.emit("group.member_banned", {
    groupId,
    userId: targetUserId,
    moderatorId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Unban a group member. Restores to pending status (still needs approval to re-join).
 * Caller must be creator or leader.
 */
export async function unbanGroupMember(
  moderatorId: string,
  groupId: string,
  targetUserId: string,
): Promise<void> {
  const callerMembership = await getGroupMember(groupId, moderatorId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can unban members",
    });
  }

  const target = await getGroupMember(groupId, targetUserId);
  if (!target || target.status !== "banned") {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "No ban found for this user in this group",
    });
  }

  // Remove the member record so they can re-request to join
  await removeGroupMember(groupId, targetUserId);
  await logGroupModerationAction({
    groupId,
    moderatorId,
    targetUserId,
    targetType: "member",
    action: "unban",
  });

  eventBus.emit("group.member_unbanned", {
    groupId,
    userId: targetUserId,
    moderatorId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Leave a group. Group creators cannot leave (must transfer ownership first).
 */
export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  const membership = await getGroupMember(groupId, userId);
  if (!membership) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "You are not a member of this group",
    });
  }

  if (membership.role === "creator") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Group creators cannot leave. Transfer ownership first.",
    });
  }

  await removeGroupMember(groupId, userId);

  eventBus.emit("group.member_left", {
    groupId,
    userId,
    timestamp: new Date().toISOString(),
  });

  // System message in General channel
  const conversationId = await getDefaultChannelConversationId(groupId);
  if (conversationId) {
    const name = await getDisplayName(userId);
    await messageService.sendSystemMessage(conversationId, userId, `${name} left the group`);
  }
}
