import "server-only";
import { db } from "../index";
import { portalSeekerProfiles } from "../schema/portal-seeker-profiles";
import type { NewPortalSeekerProfile, PortalSeekerProfile } from "../schema/portal-seeker-profiles";
import { auditLogs } from "../schema/audit-logs";
import { eq } from "drizzle-orm";

export async function createSeekerProfile(
  data: NewPortalSeekerProfile,
): Promise<PortalSeekerProfile> {
  const [profile] = await db.insert(portalSeekerProfiles).values(data).returning();
  if (!profile) throw new Error("Failed to create seeker profile");
  return profile;
}

export async function getSeekerProfileByUserId(
  userId: string,
): Promise<PortalSeekerProfile | null> {
  const [profile] = await db
    .select()
    .from(portalSeekerProfiles)
    .where(eq(portalSeekerProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

export async function getSeekerProfileById(id: string): Promise<PortalSeekerProfile | null> {
  const [profile] = await db
    .select()
    .from(portalSeekerProfiles)
    .where(eq(portalSeekerProfiles.id, id))
    .limit(1);
  return profile ?? null;
}

export async function updateSeekerProfile(
  id: string,
  patch: Partial<Omit<NewPortalSeekerProfile, "id" | "userId" | "createdAt">>,
): Promise<PortalSeekerProfile | null> {
  const [updated] = await db
    .update(portalSeekerProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(portalSeekerProfiles.id, id))
    .returning();
  return updated ?? null;
}

export async function updateSeekerVisibility(
  userId: string,
  visibility: "active" | "passive" | "hidden",
): Promise<PortalSeekerProfile | null> {
  const [updated] = await db
    .update(portalSeekerProfiles)
    .set({ visibility, updatedAt: new Date() })
    .where(eq(portalSeekerProfiles.userId, userId))
    .returning();
  return updated ?? null;
}

export async function updateSeekerConsent(
  userId: string,
  patch: { consentMatching?: boolean; consentEmployerView?: boolean },
  auditEntries: Array<typeof auditLogs.$inferInsert>,
): Promise<PortalSeekerProfile | null> {
  return await db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(portalSeekerProfiles)
      .where(eq(portalSeekerProfiles.userId, userId))
      .limit(1);
    if (!profile) return null;

    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.consentMatching !== undefined) {
      updateSet.consentMatching = patch.consentMatching;
      updateSet.consentMatchingChangedAt = new Date();
    }
    if (patch.consentEmployerView !== undefined) {
      updateSet.consentEmployerView = patch.consentEmployerView;
      updateSet.consentEmployerViewChangedAt = new Date();
    }

    const [updated] = await tx
      .update(portalSeekerProfiles)
      .set(updateSet)
      .where(eq(portalSeekerProfiles.id, profile.id))
      .returning();

    if (auditEntries.length > 0) {
      await tx.insert(auditLogs).values(auditEntries);
    }

    return updated ?? null;
  });
}

// Origin: P-2.2. Consumer: P-2.x matching engine. Do not bypass this helper in any matching code path.
export async function isSeekerEligibleForMatching(userId: string): Promise<boolean> {
  const [profile] = await db
    .select({ consentMatching: portalSeekerProfiles.consentMatching })
    .from(portalSeekerProfiles)
    .where(eq(portalSeekerProfiles.userId, userId))
    .limit(1);
  return profile?.consentMatching === true;
}
