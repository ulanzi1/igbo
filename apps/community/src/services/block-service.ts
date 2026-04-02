import "server-only";
import {
  isBlocked,
  blockUser,
  unblockUser,
  isMuted,
  muteUser,
  unmuteUser,
  getBlockedUserIds,
  getUsersWhoBlocked,
  getUsersWhoMuted,
} from "@igbo/db/queries/block-mute";

/**
 * BlockService — shared query filters for block/mute checks.
 * Used by notifications, directory, member suggestions.
 */

export async function blockMember(blockerUserId: string, blockedUserId: string): Promise<void> {
  await blockUser(blockerUserId, blockedUserId);
}

export async function unblockMember(blockerUserId: string, blockedUserId: string): Promise<void> {
  await unblockUser(blockerUserId, blockedUserId);
}

export async function isUserBlocked(
  blockerUserId: string,
  blockedUserId: string,
): Promise<boolean> {
  return isBlocked(blockerUserId, blockedUserId);
}

export async function muteMember(muterUserId: string, mutedUserId: string): Promise<void> {
  await muteUser(muterUserId, mutedUserId);
}

export async function unmuteMember(muterUserId: string, mutedUserId: string): Promise<void> {
  await unmuteUser(muterUserId, mutedUserId);
}

export async function isUserMuted(muterUserId: string, mutedUserId: string): Promise<boolean> {
  return isMuted(muterUserId, mutedUserId);
}

/**
 * Returns the IDs blocked by the given user — used to filter content in
 * directory and member suggestion features.
 */
export async function getBlockList(userId: string): Promise<string[]> {
  return getBlockedUserIds(userId);
}

/**
 * Returns user IDs that have blocked actorId — used to filter notification
 * recipients (do not notify someone who blocked the actor).
 */
export async function getWhoBlockedUser(actorId: string): Promise<string[]> {
  return getUsersWhoBlocked(actorId);
}

/**
 * Filter a list of recipient user IDs to exclude:
 * 1. actorId itself (never notify the actor)
 * 2. Users who have blocked actorId (the one causing the notification)
 * 3. Users who have muted actorId (suppress notifications from muted users)
 */
export async function filterNotificationRecipients(
  recipientIds: string[],
  actorId: string,
): Promise<string[]> {
  if (recipientIds.length === 0) return [];

  const [blockerIds, muterIds] = await Promise.all([
    getUsersWhoBlocked(actorId),
    getUsersWhoMuted(actorId),
  ]);
  const excludeSet = new Set([...blockerIds, ...muterIds]);

  return recipientIds.filter((id) => id !== actorId && !excludeSet.has(id));
}
