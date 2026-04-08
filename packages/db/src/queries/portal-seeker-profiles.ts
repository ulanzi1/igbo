import "server-only";
import { db } from "../index";
import { portalSeekerProfiles } from "../schema/portal-seeker-profiles";
import type { NewPortalSeekerProfile, PortalSeekerProfile } from "../schema/portal-seeker-profiles";
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
