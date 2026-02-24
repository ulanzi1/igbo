import "server-only";
import { getUserMembershipTier, updateUserMembershipTier } from "@/db/queries/auth-permissions";
import { findActiveSessionsByUserId } from "@/db/queries/auth-sessions";
import { evictAllUserSessions } from "@/server/auth/redis-session-cache";
import { logAdminAction } from "@/services/audit-logger";
import { eventBus } from "@/services/event-bus";
import type { MembershipTier } from "@/db/queries/auth-permissions";

export type { MembershipTier };

export async function changeMemberTier(
  userId: string,
  newTier: MembershipTier,
  changedBy: string,
): Promise<void> {
  const previousTier = await getUserMembershipTier(userId);

  // No-op if the tier hasn't changed
  if (previousTier === newTier) {
    return;
  }

  await updateUserMembershipTier(userId, newTier, changedBy);

  // Evict all user sessions so the JWT is refreshed with new tier on next request
  const sessions = await findActiveSessionsByUserId(userId);
  await evictAllUserSessions(sessions.map((s) => s.sessionToken));

  // Emit domain event
  await eventBus.emit("member.tier_changed", {
    userId,
    previousTier,
    newTier,
    changedBy,
    timestamp: new Date().toISOString(),
  });

  // Audit log
  await logAdminAction({
    actorId: changedBy,
    action: "MEMBER_TIER_CHANGED",
    targetUserId: userId,
    details: { previousTier, newTier },
  });

  // TODO(Story 1.15): Emit notification to member about tier change (notification system not yet built)
}

export async function getMemberTier(userId: string): Promise<MembershipTier> {
  return getUserMembershipTier(userId);
}

export function getDefaultTier(): MembershipTier {
  return "BASIC";
}
