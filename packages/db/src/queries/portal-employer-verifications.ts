import "server-only";
import { db } from "../index";
import { portalEmployerVerifications } from "../schema/portal-employer-verifications";
import { portalCompanyProfiles } from "../schema/portal-company-profiles";
import { authUsers } from "../schema/auth-users";
import type {
  PortalEmployerVerification,
  NewPortalEmployerVerification,
  VerificationDocument,
} from "../schema/portal-employer-verifications";
import { eq, and, sql, desc, asc } from "drizzle-orm";

export type { PortalEmployerVerification, NewPortalEmployerVerification, VerificationDocument };

export interface VerificationQueueItem {
  id: string;
  companyId: string;
  companyName: string;
  ownerUserName: string;
  ownerUserId: string;
  documentCount: number;
  submittedAt: Date;
  status: string;
}

export async function insertVerificationRequest(data: {
  companyId: string;
  submittedDocuments: VerificationDocument[];
}): Promise<PortalEmployerVerification> {
  const [inserted] = await db
    .insert(portalEmployerVerifications)
    .values({
      companyId: data.companyId,
      submittedDocuments: data.submittedDocuments,
    })
    .returning();
  if (!inserted) throw new Error("insertVerificationRequest: no row returned");
  return inserted;
}

export async function getPendingVerificationForCompany(
  companyId: string,
): Promise<PortalEmployerVerification | null> {
  const [row] = await db
    .select()
    .from(portalEmployerVerifications)
    .where(
      and(
        eq(portalEmployerVerifications.companyId, companyId),
        eq(portalEmployerVerifications.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getVerificationById(id: string): Promise<PortalEmployerVerification | null> {
  const [row] = await db
    .select()
    .from(portalEmployerVerifications)
    .where(eq(portalEmployerVerifications.id, id))
    .limit(1);
  return row ?? null;
}

export async function getVerificationHistoryForCompany(
  companyId: string,
): Promise<PortalEmployerVerification[]> {
  return db
    .select()
    .from(portalEmployerVerifications)
    .where(eq(portalEmployerVerifications.companyId, companyId))
    .orderBy(desc(portalEmployerVerifications.createdAt));
}

export async function getLatestVerificationForCompany(
  companyId: string,
): Promise<PortalEmployerVerification | null> {
  const [row] = await db
    .select()
    .from(portalEmployerVerifications)
    .where(eq(portalEmployerVerifications.companyId, companyId))
    .orderBy(desc(portalEmployerVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listPendingVerifications(options: {
  limit: number;
  offset: number;
}): Promise<{ items: VerificationQueueItem[]; total: number }> {
  const { limit, offset } = options;

  const [items, countRows] = await Promise.all([
    db
      .select({
        id: portalEmployerVerifications.id,
        companyId: portalEmployerVerifications.companyId,
        companyName: portalCompanyProfiles.name,
        ownerUserName: authUsers.name,
        ownerUserId: portalCompanyProfiles.ownerUserId,
        documentCount: sql<number>`jsonb_array_length(${portalEmployerVerifications.submittedDocuments})`,
        submittedAt: portalEmployerVerifications.submittedAt,
        status: portalEmployerVerifications.status,
      })
      .from(portalEmployerVerifications)
      .innerJoin(
        portalCompanyProfiles,
        eq(portalEmployerVerifications.companyId, portalCompanyProfiles.id),
      )
      .innerJoin(authUsers, eq(portalCompanyProfiles.ownerUserId, authUsers.id))
      .where(eq(portalEmployerVerifications.status, "pending"))
      .orderBy(asc(portalEmployerVerifications.submittedAt), asc(portalEmployerVerifications.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(${portalEmployerVerifications.id})::int` })
      .from(portalEmployerVerifications)
      .where(eq(portalEmployerVerifications.status, "pending")),
  ]);

  return { items: items as VerificationQueueItem[], total: countRows[0]?.total ?? 0 };
}

export async function approveVerification(
  id: string,
  adminUserId: string,
): Promise<PortalEmployerVerification | null> {
  const [updated] = await db
    .update(portalEmployerVerifications)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedByAdminId: adminUserId,
    })
    .where(
      and(
        eq(portalEmployerVerifications.id, id),
        eq(portalEmployerVerifications.status, "pending"),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function rejectVerification(
  id: string,
  adminUserId: string,
  adminNotes: string,
): Promise<PortalEmployerVerification | null> {
  const [updated] = await db
    .update(portalEmployerVerifications)
    .set({
      status: "rejected",
      adminNotes,
      reviewedAt: new Date(),
      reviewedByAdminId: adminUserId,
    })
    .where(
      and(
        eq(portalEmployerVerifications.id, id),
        eq(portalEmployerVerifications.status, "pending"),
      ),
    )
    .returning();
  return updated ?? null;
}
