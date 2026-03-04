import "server-only";
import { ApiError } from "@/lib/api-error";
import {
  getGroupById,
  getGroupMember,
  countActiveGroupsForUser,
  insertGroupMember,
  updateGroupMemberStatus,
  removeGroupMember,
  listGroupLeaders,
} from "@/db/queries/groups";
import { getPlatformSetting } from "@/db/queries/platform-settings";
import { eventBus } from "@/services/event-bus";

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

  eventBus.emit("group.member_joined", {
    groupId,
    userId,
    timestamp: new Date().toISOString(),
  });

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
      detail: `User has reached the maximum of ${limit} groups`,
    });
  }

  await updateGroupMemberStatus(groupId, memberId, "active");

  eventBus.emit("group.join_approved", {
    groupId,
    userId: memberId,
    approvedBy: leaderId,
    timestamp: new Date().toISOString(),
  });
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
}
