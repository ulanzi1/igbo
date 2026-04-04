import "server-only";
import { db } from "../index";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import type {
  NewPortalCompanyProfile,
  PortalCompanyProfile,
} from "../schema/portal-company-profiles";
import { eq } from "drizzle-orm";

export async function createCompanyProfile(
  data: NewPortalCompanyProfile,
): Promise<PortalCompanyProfile> {
  const [profile] = await db.insert(portalCompanyProfiles).values(data).returning();
  if (!profile) throw new Error("Failed to create company profile");
  return profile;
}

export async function getCompanyByOwnerId(
  ownerUserId: string,
): Promise<PortalCompanyProfile | null> {
  const [profile] = await db
    .select()
    .from(portalCompanyProfiles)
    .where(eq(portalCompanyProfiles.ownerUserId, ownerUserId))
    .limit(1);
  return profile ?? null;
}

export async function getCompanyById(id: string): Promise<PortalCompanyProfile | null> {
  const [profile] = await db
    .select()
    .from(portalCompanyProfiles)
    .where(eq(portalCompanyProfiles.id, id))
    .limit(1);
  return profile ?? null;
}

export async function updateCompanyProfile(
  id: string,
  data: Partial<Omit<NewPortalCompanyProfile, "id" | "ownerUserId" | "createdAt">>,
): Promise<PortalCompanyProfile | null> {
  const [updated] = await db
    .update(portalCompanyProfiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(portalCompanyProfiles.id, id))
    .returning();
  return updated ?? null;
}
