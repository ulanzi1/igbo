import "server-only";
import { db } from "../index";
import { portalJobPostings } from "../schema/portal-job-postings";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import type {
  NewPortalJobPosting,
  PortalJobPosting,
  PortalJobStatus,
} from "../schema/portal-job-postings";
import type { PortalCompanyProfile } from "../schema/portal-company-profiles";
import { eq, desc, and, count } from "drizzle-orm";

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

export async function getJobPostingsByCompanyIdWithFilter(
  companyId: string,
  statusFilter?: PortalJobStatus,
): Promise<PortalJobPosting[]> {
  if (statusFilter !== undefined) {
    return db
      .select()
      .from(portalJobPostings)
      .where(
        and(eq(portalJobPostings.companyId, companyId), eq(portalJobPostings.status, statusFilter)),
      )
      .orderBy(desc(portalJobPostings.createdAt));
  }
  return db
    .select()
    .from(portalJobPostings)
    .where(eq(portalJobPostings.companyId, companyId))
    .orderBy(desc(portalJobPostings.createdAt));
}

export async function getJobPostingWithCompany(
  postingId: string,
): Promise<{ posting: PortalJobPosting; company: PortalCompanyProfile } | null> {
  const [row] = await db
    .select({
      posting: portalJobPostings,
      company: portalCompanyProfiles,
    })
    .from(portalJobPostings)
    .innerJoin(portalCompanyProfiles, eq(portalJobPostings.companyId, portalCompanyProfiles.id))
    .where(eq(portalJobPostings.id, postingId))
    .limit(1);
  return row ?? null;
}

export async function countActivePostingsByCompanyId(companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(portalJobPostings)
    .where(and(eq(portalJobPostings.companyId, companyId), eq(portalJobPostings.status, "active")));
  return row?.count ?? 0;
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
