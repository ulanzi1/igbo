import "server-only";
import { eq, lte, and } from "drizzle-orm";
import { db } from "../index";
import { gdprExportRequests } from "../schema/gdpr";
import { authUsers } from "../schema/auth-users";
import type { GdprExportRequest, NewGdprExportRequest } from "../schema/gdpr";
import type { AuthUser } from "../schema/auth-users";

export async function createExportRequest(userId: string): Promise<GdprExportRequest> {
  const [row] = await db.insert(gdprExportRequests).values({ userId }).returning();
  if (!row) throw new Error("Failed to create export request");
  return row;
}

export async function getExportRequestByToken(token: string): Promise<GdprExportRequest | null> {
  const [row] = await db
    .select()
    .from(gdprExportRequests)
    .where(eq(gdprExportRequests.downloadToken, token))
    .limit(1);
  return row ?? null;
}

export async function getUserExportRequests(userId: string): Promise<GdprExportRequest[]> {
  return db.select().from(gdprExportRequests).where(eq(gdprExportRequests.userId, userId));
}

export async function updateExportRequest(
  id: string,
  data: Partial<NewGdprExportRequest>,
): Promise<void> {
  await db.update(gdprExportRequests).set(data).where(eq(gdprExportRequests.id, id));
}

export async function findAccountsPendingAnonymization(): Promise<AuthUser[]> {
  return db
    .select()
    .from(authUsers)
    .where(
      and(
        eq(authUsers.accountStatus, "PENDING_DELETION"),
        lte(authUsers.scheduledDeletionAt, new Date()),
      ),
    );
}
