import "server-only";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { communityProfiles } from "@/db/schema/community-profiles";
import type { NewCommunityProfile } from "@/db/schema/community-profiles";

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
