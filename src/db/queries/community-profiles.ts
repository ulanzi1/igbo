import "server-only";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { communityProfiles, communitySocialLinks } from "@/db/schema/community-profiles";
import type { NewCommunityProfile, CommunitySocialLink } from "@/db/schema/community-profiles";

/** Retrieve a profile by user ID (excludes soft-deleted records). */
export async function getProfileByUserId(userId: string) {
  const [profile] = await db
    .select()
    .from(communityProfiles)
    .where(and(eq(communityProfiles.userId, userId), isNull(communityProfiles.deletedAt)))
    .limit(1);

  return profile ?? null;
}

/** Upsert profile fields. Caller must set updated_at manually to respect project convention. */
export async function upsertProfile(
  userId: string,
  data: Omit<NewCommunityProfile, "id" | "userId" | "createdAt" | "updatedAt">,
) {
  const now = new Date();
  const [profile] = await db
    .insert(communityProfiles)
    .values({ ...data, userId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: communityProfiles.userId,
      set: { ...data, updatedAt: now },
    })
    .returning();
  return profile ?? null;
}

/** Record guidelines acknowledgment timestamp. */
export async function setGuidelinesAcknowledged(userId: string) {
  const now = new Date();
  await db
    .update(communityProfiles)
    .set({ guidelinesAcknowledgedAt: now, updatedAt: now })
    .where(eq(communityProfiles.userId, userId));
}

/** Record tour completion or skip. */
export async function setTourComplete(userId: string, skipped: boolean) {
  const now = new Date();
  await db
    .update(communityProfiles)
    .set({
      tourCompletedAt: skipped ? null : now,
      tourSkippedAt: skipped ? now : null,
      updatedAt: now,
    })
    .where(eq(communityProfiles.userId, userId));
}

/** List all profiles where profile_completed_at IS NULL (for admin use). */
export async function findIncompleteProfiles() {
  return db
    .select()
    .from(communityProfiles)
    .where(and(isNull(communityProfiles.profileCompletedAt), isNull(communityProfiles.deletedAt)));
}

/**
 * Find all profiles with a completed profile (profile_completed_at IS NOT NULL).
 * Use this as the basis for member-facing discovery queries (directory, cards, search)
 * to exclude users who have not completed onboarding.
 */
export async function findCompletedProfiles() {
  return db
    .select()
    .from(communityProfiles)
    .where(
      and(isNotNull(communityProfiles.profileCompletedAt), isNull(communityProfiles.deletedAt)),
    );
}

/** Update display fields only (not onboarding timestamps). */
export async function updateProfileFields(
  userId: string,
  data: {
    displayName?: string;
    bio?: string | null;
    photoUrl?: string | null;
    locationCity?: string | null;
    locationState?: string | null;
    locationCountry?: string | null;
    locationLat?: string | null;
    locationLng?: string | null;
    interests?: string[];
    culturalConnections?: string[];
    languages?: string[];
  },
) {
  const now = new Date();
  const [profile] = await db
    .update(communityProfiles)
    .set({ ...data, updatedAt: now })
    .where(and(eq(communityProfiles.userId, userId), isNull(communityProfiles.deletedAt)))
    .returning();
  return profile ?? null;
}

/** Update privacy settings (profileVisibility and/or locationVisible). */
export async function updatePrivacySettings(
  userId: string,
  settings: {
    profileVisibility?: "PUBLIC_TO_MEMBERS" | "LIMITED" | "PRIVATE";
    locationVisible?: boolean;
  },
) {
  const now = new Date();
  const [profile] = await db
    .update(communityProfiles)
    .set({ ...settings, updatedAt: now })
    .where(and(eq(communityProfiles.userId, userId), isNull(communityProfiles.deletedAt)))
    .returning();
  return profile ?? null;
}

/** Get a profile along with its social links via LEFT JOIN. */
export async function getProfileWithSocialLinks(userId: string): Promise<{
  profile: typeof communityProfiles.$inferSelect | null;
  socialLinks: CommunitySocialLink[];
}> {
  const rows = await db
    .select({
      profile: communityProfiles,
      socialLink: communitySocialLinks,
    })
    .from(communityProfiles)
    .leftJoin(communitySocialLinks, eq(communitySocialLinks.userId, communityProfiles.userId))
    .where(and(eq(communityProfiles.userId, userId), isNull(communityProfiles.deletedAt)));

  if (rows.length === 0 || !rows[0]) {
    return { profile: null, socialLinks: [] };
  }

  const profile = rows[0].profile;
  const socialLinks = rows
    .map((r) => r.socialLink)
    .filter((s): s is CommunitySocialLink => s !== null);

  return { profile, socialLinks };
}

type ViewerRole = "MEMBER" | "ADMIN" | "MODERATOR";

/**
 * Load a profile for a viewer, enforcing visibility rules.
 * Always requires profileCompletedAt IS NOT NULL and deletedAt IS NULL.
 * Returns null for PRIVATE profiles viewed by non-admins (do NOT return 403 to avoid leaking existence).
 */
export async function getPublicProfileForViewer(
  viewerUserId: string,
  targetUserId: string,
  viewerRole: ViewerRole,
): Promise<{
  profile: typeof communityProfiles.$inferSelect | null;
  socialLinks: CommunitySocialLink[];
}> {
  const rows = await db
    .select({
      profile: communityProfiles,
      socialLink: communitySocialLinks,
    })
    .from(communityProfiles)
    .leftJoin(communitySocialLinks, eq(communitySocialLinks.userId, communityProfiles.userId))
    .where(
      and(
        eq(communityProfiles.userId, targetUserId),
        isNotNull(communityProfiles.profileCompletedAt),
        isNull(communityProfiles.deletedAt),
      ),
    );

  if (rows.length === 0 || !rows[0]) {
    return { profile: null, socialLinks: [] };
  }

  const profile = rows[0].profile;

  // Owner always sees their own profile
  if (viewerUserId !== targetUserId) {
    // Enforce visibility rules
    if (profile.profileVisibility === "PRIVATE") {
      if (viewerRole !== "ADMIN" && viewerRole !== "MODERATOR") {
        return { profile: null, socialLinks: [] };
      }
    }
    // TODO(Epic 5): enforce group-shared check for LIMITED visibility
    // For now, LIMITED behaves like PUBLIC_TO_MEMBERS
  }

  // Strip location fields when locationVisible = false
  const finalProfile =
    profile.locationVisible === false
      ? {
          ...profile,
          locationCity: null,
          locationState: null,
          locationCountry: null,
          locationLat: null,
          locationLng: null,
        }
      : profile;

  const socialLinks = rows
    .map((r) => r.socialLink)
    .filter((s): s is CommunitySocialLink => s !== null);

  return { profile: finalProfile, socialLinks };
}
