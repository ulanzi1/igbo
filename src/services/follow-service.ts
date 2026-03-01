import "server-only";
import { followMember, unfollowMember, isFollowing } from "@/db/queries/follows";
import { eventBus } from "@/services/event-bus";

export async function followUser(followerId: string, followingId: string): Promise<void> {
  await followMember(followerId, followingId);
  eventBus.emit("member.followed", {
    followerId,
    followedId: followingId,
    timestamp: new Date().toISOString(),
  });
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await unfollowMember(followerId, followingId);
  eventBus.emit("member.unfollowed", {
    followerId,
    followedId: followingId,
    timestamp: new Date().toISOString(),
  });
}

export async function isUserFollowing(followerId: string, followingId: string): Promise<boolean> {
  return isFollowing(followerId, followingId);
}
