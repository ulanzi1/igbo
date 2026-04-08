import "server-only";
import { db } from "../index";
import { portalSeekerPreferences } from "../schema/portal-seeker-preferences";
import type {
  NewPortalSeekerPreferences,
  PortalSeekerPreferences,
} from "../schema/portal-seeker-preferences";
import { eq } from "drizzle-orm";

export async function getSeekerPreferencesByProfileId(
  profileId: string,
): Promise<PortalSeekerPreferences | null> {
  const [row] = await db
    .select()
    .from(portalSeekerPreferences)
    .where(eq(portalSeekerPreferences.seekerProfileId, profileId))
    .limit(1);
  return row ?? null;
}

export async function upsertSeekerPreferences(
  profileId: string,
  data: Omit<NewPortalSeekerPreferences, "id" | "seekerProfileId" | "createdAt" | "updatedAt">,
): Promise<PortalSeekerPreferences> {
  const [row] = await db
    .insert(portalSeekerPreferences)
    .values({ ...data, seekerProfileId: profileId })
    .onConflictDoUpdate({
      target: portalSeekerPreferences.seekerProfileId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert seeker preferences");
  return row;
}
