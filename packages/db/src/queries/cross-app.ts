import "server-only";
import { db } from "../index";
import { authUsers } from "../schema/auth-users";
import { communityUserBadges } from "../schema/community-badges";
import { communityProfiles } from "../schema/community-profiles";
import { platformPointsLedger } from "../schema/platform-points";
import { eq, sql } from "drizzle-orm";

/**
 * Cross-app trust signal queries.
 * Portal reads community data through these named functions.
 * Community team owns the internals; portal depends only on the return types.
 */

/**
 * Engagement level thresholds (points → level string).
 * TODO: Align with platform_points_rules / @igbo/config/points when portal
 *       consumes engagement levels at scale (Story P-2.x).
 */
const ENGAGEMENT_HIGH_THRESHOLD = 500;
const ENGAGEMENT_MEDIUM_THRESHOLD = 100;

export async function getCommunityVerificationStatus(userId: string): Promise<{
  isVerified: boolean;
  verifiedAt: Date | null;
  badgeType: string | null;
}> {
  const [badge] = await db
    .select({
      badgeType: communityUserBadges.badgeType,
      assignedAt: communityUserBadges.assignedAt,
    })
    .from(communityUserBadges)
    .where(eq(communityUserBadges.userId, userId))
    .limit(1);

  if (!badge) {
    return { isVerified: false, verifiedAt: null, badgeType: null };
  }
  return {
    isVerified: true,
    verifiedAt: badge.assignedAt,
    badgeType: badge.badgeType,
  };
}

export async function getMembershipDuration(userId: string): Promise<{
  joinedAt: Date;
  durationDays: number;
}> {
  const [user] = await db
    .select({ createdAt: authUsers.createdAt })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const durationMs = Date.now() - user.createdAt.getTime();
  const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

  return { joinedAt: user.createdAt, durationDays };
}

export async function getUserEngagementLevel(userId: string): Promise<{
  level: string;
  score: number;
  lastActive: Date | null;
}> {
  const [pointsRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${platformPointsLedger.points}), 0)` })
    .from(platformPointsLedger)
    .where(eq(platformPointsLedger.userId, userId));

  const score = parseInt(pointsRow?.total ?? "0", 10);

  const [profile] = await db
    .select({ updatedAt: communityProfiles.updatedAt })
    .from(communityProfiles)
    .where(eq(communityProfiles.userId, userId))
    .limit(1);

  const lastActive = profile?.updatedAt ?? null;

  let level: string;
  if (score >= ENGAGEMENT_HIGH_THRESHOLD) {
    level = "high";
  } else if (score >= ENGAGEMENT_MEDIUM_THRESHOLD) {
    level = "medium";
  } else {
    level = "low";
  }

  return { level, score, lastActive };
}

export interface CommunityTrustSignals {
  isVerified: boolean;
  memberSince: Date | null;
  displayName: string | null;
  /** Points-based engagement level from getUserEngagementLevel */
  engagementLevel: "low" | "medium" | "high";
}

export async function getCommunityTrustSignals(
  userId: string,
): Promise<CommunityTrustSignals | null> {
  const [user] = await db
    .select({ createdAt: authUsers.createdAt })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  if (!user) return null;

  // Parallelize independent queries (profile, verification, engagement)
  const [profile, verification, engagement] = await Promise.all([
    db
      .select({ displayName: communityProfiles.displayName })
      .from(communityProfiles)
      .where(eq(communityProfiles.userId, userId))
      .limit(1)
      .then(([p]) => p ?? null),
    getCommunityVerificationStatus(userId),
    getUserEngagementLevel(userId),
  ]);

  return {
    isVerified: verification.isVerified,
    memberSince: user.createdAt,
    displayName: profile?.displayName ?? null,
    engagementLevel: engagement.level as "low" | "medium" | "high",
  };
}

export async function getCommunityProfileForPrefill(userId: string): Promise<{
  displayName: string | null;
  bio: string | null;
}> {
  const [profile] = await db
    .select({
      displayName: communityProfiles.displayName,
      bio: communityProfiles.bio,
    })
    .from(communityProfiles)
    .where(eq(communityProfiles.userId, userId))
    .limit(1);
  return {
    displayName: profile?.displayName ?? null,
    bio: profile?.bio ?? null,
  };
}

export interface SeekerTrustSignals {
  isVerified: boolean;
  badgeType: string | null;
  memberSince: Date | null;
  memberDurationDays: number;
  communityPoints: number;
  engagementLevel: "low" | "medium" | "high";
  displayName: string | null;
}

export async function getSeekerTrustSignals(userId: string): Promise<SeekerTrustSignals | null> {
  const [user] = await db
    .select({ createdAt: authUsers.createdAt })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  if (!user) return null;

  const [profile, verification, engagement] = await Promise.all([
    db
      .select({ displayName: communityProfiles.displayName })
      .from(communityProfiles)
      .where(eq(communityProfiles.userId, userId))
      .limit(1)
      .then(([p]) => p ?? null),
    getCommunityVerificationStatus(userId),
    getUserEngagementLevel(userId),
  ]);

  const durationMs = Date.now() - user.createdAt.getTime();
  const memberDurationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

  // getCommunityVerificationStatus may return null for users with no verification record
  const safeVerif = verification ?? { isVerified: false, badgeType: null, verifiedAt: null };

  return {
    isVerified: safeVerif.isVerified,
    badgeType: safeVerif.badgeType,
    memberSince: user.createdAt,
    memberDurationDays,
    communityPoints: engagement.score,
    engagementLevel: engagement.level as "low" | "medium" | "high",
    displayName: profile?.displayName ?? null,
  };
}

/**
 * Returns the **upstream** referral ancestry for a user — i.e. who referred
 * this user, who referred *them*, etc., up to MAX_DEPTH levels.
 *
 * NOTE: `referralName` in authUsers is a free-text display name (not a FK).
 * Name-based lookup is inherently fragile; if two users share the same name
 * the first match wins. A future migration should add a `referredByUserId`
 * FK column to eliminate this ambiguity.
 *
 * The sequential-query approach (2 per depth) is acceptable while this is a
 * stub contract (MAX_DEPTH=3 → max 6 queries). Story P-2.x should consider
 * a recursive CTE if call volume justifies it.
 */
export async function getReferralChain(userId: string): Promise<{
  referrals: Array<{ userId: string; depth: number }>;
}> {
  const MAX_DEPTH = 3;
  const referrals: Array<{ userId: string; depth: number }> = [];

  let currentUserId = userId;
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const [user] = await db
      .select({ id: authUsers.id, referralName: authUsers.referralName })
      .from(authUsers)
      .where(eq(authUsers.id, currentUserId))
      .limit(1);

    if (!user?.referralName) break;

    // Find the user who referred currentUserId (referralName is the referrer's display name)
    const [referrer] = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.name, user.referralName))
      .limit(1);

    if (!referrer) break;

    referrals.push({ userId: referrer.id, depth });
    currentUserId = referrer.id;
  }

  return { referrals };
}
