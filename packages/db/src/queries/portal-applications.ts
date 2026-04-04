import "server-only";
import { db } from "../index";
import { portalApplications } from "../schema/portal-applications";
import type {
  NewPortalApplication,
  PortalApplication,
  PortalApplicationStatus,
} from "../schema/portal-applications";
import { eq, desc } from "drizzle-orm";

export async function createApplication(data: NewPortalApplication): Promise<PortalApplication> {
  const [application] = await db.insert(portalApplications).values(data).returning();
  if (!application) throw new Error("Failed to create application");
  return application;
}

export async function getApplicationsByJobId(jobId: string): Promise<PortalApplication[]> {
  return db
    .select()
    .from(portalApplications)
    .where(eq(portalApplications.jobId, jobId))
    .orderBy(desc(portalApplications.createdAt));
}

export async function getApplicationsBySeekerId(
  seekerUserId: string,
): Promise<PortalApplication[]> {
  return db
    .select()
    .from(portalApplications)
    .where(eq(portalApplications.seekerUserId, seekerUserId))
    .orderBy(desc(portalApplications.createdAt));
}

export async function updateApplicationStatus(
  id: string,
  status: PortalApplicationStatus,
): Promise<PortalApplication | null> {
  const [updated] = await db
    .update(portalApplications)
    .set({ status, updatedAt: new Date() })
    .where(eq(portalApplications.id, id))
    .returning();
  return updated ?? null;
}
