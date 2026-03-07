import "server-only";
import { findUserById } from "@/db/queries/auth-queries";
import { getUserMembershipTier, type MembershipTier } from "@/db/queries/auth-permissions";
import { auth } from "@/server/auth/config";
import { eventBus } from "@/services/event-bus";

// ─── Permission Matrix ────────────────────────────────────────────────────────

export const PERMISSION_MATRIX = {
  BASIC: {
    canChat: true,
    canJoinPublicGroups: true,
    canViewArticles: true,
    canAttendEvents: true,
    canUseMemberDirectory: true,
    canPublishArticle: false,
    canCreateGroup: false,
    canAssignGroupLeaders: false,
    maxArticlesPerWeek: 0,
    articleVisibility: [] as string[],
    canCreateFeedPost: false,
    maxFeedPostsPerWeek: 0,
    canCreateEvent: false,
  },
  PROFESSIONAL: {
    canChat: true,
    canJoinPublicGroups: true,
    canViewArticles: true,
    canAttendEvents: true,
    canUseMemberDirectory: true,
    canPublishArticle: true,
    canCreateGroup: false,
    canAssignGroupLeaders: false,
    maxArticlesPerWeek: 1,
    articleVisibility: ["MEMBERS_ONLY"],
    canCreateFeedPost: true,
    maxFeedPostsPerWeek: 1, // FR51: Professional 1/week
    canCreateEvent: true,
  },
  TOP_TIER: {
    canChat: true,
    canJoinPublicGroups: true,
    canViewArticles: true,
    canAttendEvents: true,
    canUseMemberDirectory: true,
    canPublishArticle: true,
    canCreateGroup: true,
    canAssignGroupLeaders: true,
    maxArticlesPerWeek: 2,
    articleVisibility: ["MEMBERS_ONLY", "PUBLIC"],
    canCreateFeedPost: true,
    maxFeedPostsPerWeek: 999, // FR51: Top-tier — effectively unlimited for dev/testing
    canCreateEvent: true,
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type TierPermissions = (typeof PERMISSION_MATRIX)[keyof typeof PERMISSION_MATRIX];

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  tierRequired?: string;
}

// ─── Permission Service ───────────────────────────────────────────────────────

export async function getPermissions(userId: string): Promise<TierPermissions> {
  const tier = await getUserMembershipTier(userId);
  return PERMISSION_MATRIX[tier];
}

export async function canCreateGroup(userId: string): Promise<PermissionResult> {
  const tier = await getUserMembershipTier(userId);
  if (PERMISSION_MATRIX[tier].canCreateGroup) {
    return { allowed: true };
  }
  const result: PermissionResult = {
    allowed: false,
    reason: getTierUpgradeMessage("createGroup", "TOP_TIER"),
    tierRequired: "TOP_TIER",
  };
  await emitPermissionDenied(userId, "createGroup", result.reason!);
  return result;
}

export async function canPublishArticle(userId: string): Promise<PermissionResult> {
  const tier = await getUserMembershipTier(userId);
  if (!PERMISSION_MATRIX[tier].canPublishArticle) {
    const result: PermissionResult = {
      allowed: false,
      reason: getTierUpgradeMessage("publishArticle", "PROFESSIONAL"),
      tierRequired: "PROFESSIONAL",
    };
    await emitPermissionDenied(userId, "publishArticle", result.reason!);
    return result;
  }
  const { countWeeklyArticleSubmissions } = await import("@/db/queries/articles");
  const { getEffectiveArticleLimit } = await import("@/db/queries/points");
  const weeklyCount = await countWeeklyArticleSubmissions(userId);
  const maxPerWeek = await getEffectiveArticleLimit(userId, tier);
  if (weeklyCount >= maxPerWeek) {
    const result: PermissionResult = {
      allowed: false,
      reason: "Articles.permissions.weeklyLimitReached",
    };
    await emitPermissionDenied(userId, "publishArticle", result.reason!);
    return result;
  }
  return { allowed: true };
}

export async function canCreateEvent(userId: string): Promise<PermissionResult> {
  const tier = await getUserMembershipTier(userId);
  if (PERMISSION_MATRIX[tier].canCreateEvent) {
    return { allowed: true };
  }
  const result: PermissionResult = {
    allowed: false,
    reason: getTierUpgradeMessage("createEvent", "PROFESSIONAL"),
    tierRequired: "PROFESSIONAL",
  };
  await emitPermissionDenied(userId, "createEvent", result.reason!);
  return result;
}

export async function canCreateFeedPost(userId: string): Promise<PermissionResult> {
  const tier = await getUserMembershipTier(userId);
  if (!PERMISSION_MATRIX[tier].canCreateFeedPost) {
    const result: PermissionResult = {
      allowed: false,
      reason: getTierUpgradeMessage("createFeedPost", "PROFESSIONAL"),
      tierRequired: "PROFESSIONAL",
    };
    await emitPermissionDenied(userId, "createFeedPost", result.reason!);
    return result;
  }
  return { allowed: true };
}

export function getMaxFeedPostsPerWeek(tier: MembershipTier): number {
  return PERMISSION_MATRIX[tier].maxFeedPostsPerWeek;
}

export async function canAssignGroupLeaders(userId: string): Promise<PermissionResult> {
  const tier = await getUserMembershipTier(userId);
  if (PERMISSION_MATRIX[tier].canAssignGroupLeaders) {
    return { allowed: true };
  }
  const result: PermissionResult = {
    allowed: false,
    reason: getTierUpgradeMessage("assignGroupLeaders", "TOP_TIER"),
    tierRequired: "TOP_TIER",
  };
  await emitPermissionDenied(userId, "assignGroupLeaders", result.reason!);
  return result;
}

export async function checkPermission(
  userId: string,
  action: keyof TierPermissions,
): Promise<PermissionResult> {
  const tier = await getUserMembershipTier(userId);
  const permissions = PERMISSION_MATRIX[tier];
  const value = permissions[action];
  // Boolean permissions: allow if truthy, array permissions: allow if non-empty, numeric: allow if > 0
  const allowed = Array.isArray(value)
    ? value.length > 0
    : typeof value === "boolean"
      ? value
      : (value as number) > 0;

  if (!allowed) {
    const requiredTier = findMinimumTier(action);
    const result: PermissionResult = {
      allowed: false,
      reason: getTierUpgradeMessage(action as string, requiredTier),
      tierRequired: requiredTier,
    };
    await emitPermissionDenied(userId, action as string, result.reason!);
    return result;
  }
  return { allowed: true };
}

/** Map of known actions to specific i18n message keys. */
const UPGRADE_MESSAGE_KEYS: Record<string, string> = {
  createGroup: "Permissions.groupCreationRequired",
  publishArticle: "Permissions.articlePublishRequired",
  assignGroupLeaders: "Permissions.groupLeaderRequired",
  createFeedPost: "Permissions.feedPostRequired",
  createEvent: "Permissions.eventCreationRequired",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getTierUpgradeMessage(action: string, requiredTier: string): string {
  // Return specific i18n key if available, otherwise the generic key with action/tier context
  return UPGRADE_MESSAGE_KEYS[action] ?? `Permissions.upgradeRequired`;
}

// ─── Tier resolution helper ──────────────────────────────────────────────────

const TIER_ORDER = ["BASIC", "PROFESSIONAL", "TOP_TIER"] as const;

/** Find the lowest tier that grants a given permission. */
function findMinimumTier(action: keyof TierPermissions): string {
  for (const tier of TIER_ORDER) {
    const value = PERMISSION_MATRIX[tier][action];
    const granted = Array.isArray(value)
      ? value.length > 0
      : typeof value === "boolean"
        ? value
        : (value as number) > 0;
    if (granted) return tier;
  }
  return "TOP_TIER";
}

// ─── Legacy exports (preserved for backward compatibility) ───────────────────

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  return user?.role === "ADMIN";
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.id;
}

export async function requireAuthenticatedSession(): Promise<{ userId: string; role: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    const { ApiError } = await import("@/lib/api-error");
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
  return { userId: session.user.id, role: session.user.role };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function emitPermissionDenied(userId: string, action: string, reason: string): Promise<void> {
  try {
    await eventBus.emit("member.permission_denied", {
      userId,
      action,
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical: analytics event emission failure must not block the request
  }
}
