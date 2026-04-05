import "server-only";
import { db } from "../index";
import { portalJobPostings } from "../schema/portal-job-postings";
import type {
  NewPortalJobPosting,
  PortalJobPosting,
  PortalJobStatus,
} from "../schema/portal-job-postings";
import { eq, desc } from "drizzle-orm";

export async function createJobPosting(data: NewPortalJobPosting): Promise<PortalJobPosting> {
  const [posting] = await db.insert(portalJobPostings).values(data).returning();
  if (!posting) throw new Error("Failed to create job posting");
  return posting;
}

export async function getJobPostingById(id: string): Promise<PortalJobPosting | null> {
  const [posting] = await db
    .select()
    .from(portalJobPostings)
    .where(eq(portalJobPostings.id, id))
    .limit(1);
  return posting ?? null;
}

export async function getJobPostingsByCompanyId(companyId: string): Promise<PortalJobPosting[]> {
  return db
    .select()
    .from(portalJobPostings)
    .where(eq(portalJobPostings.companyId, companyId))
    .orderBy(desc(portalJobPostings.createdAt));
}

export async function updateJobPosting(
  id: string,
  data: Partial<Omit<NewPortalJobPosting, "id" | "createdAt">>,
): Promise<PortalJobPosting | null> {
  const [updated] = await db
    .update(portalJobPostings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(portalJobPostings.id, id))
    .returning();
  return updated ?? null;
}

export async function updateJobPostingStatus(
  id: string,
  status: PortalJobStatus,
): Promise<PortalJobPosting | null> {
  const [updated] = await db
    .update(portalJobPostings)
    .set({ status, updatedAt: new Date() })
    .where(eq(portalJobPostings.id, id))
    .returning();
  return updated ?? null;
}
