import "server-only";
import { eq, isNull, and, count } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";
import type { AuthUser } from "@/db/schema/auth-users";

export type ApplicationStatus = "PENDING_APPROVAL" | "APPROVED" | "INFO_REQUESTED" | "REJECTED";

export interface ListApplicationsOptions {
  status?: ApplicationStatus;
  page?: number;
  pageSize?: number;
}

export interface ApplicationListResult {
  data: AuthUser[];
  meta: { page: number; pageSize: number; total: number };
}

/**
 * Lists applications filtered by status with offset pagination.
 * Always excludes soft-deleted rows.
 */
export async function listApplications(
  options: ListApplicationsOptions = {},
): Promise<ApplicationListResult> {
  const { status = "PENDING_APPROVAL", page = 1, pageSize = 20 } = options;
  const offset = (page - 1) * pageSize;

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(authUsers)
      .where(and(eq(authUsers.accountStatus, status), isNull(authUsers.deletedAt)))
      .orderBy(authUsers.createdAt)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(authUsers)
      .where(and(eq(authUsers.accountStatus, status), isNull(authUsers.deletedAt))),
  ]);

  return {
    data: rows,
    meta: { page, pageSize, total: countRow?.count ?? 0 },
  };
}

/**
 * Returns a single application by ID.
 * Returns null if not found or soft-deleted.
 */
export async function getApplicationById(id: string): Promise<AuthUser | null> {
  const [row] = await db
    .select()
    .from(authUsers)
    .where(and(eq(authUsers.id, id), isNull(authUsers.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Transitions an application status.
 * Returns the updated row, or null if not found.
 */
export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  adminNotes?: string,
): Promise<AuthUser | null> {
  const values: Partial<AuthUser> & { updatedAt: Date } = {
    accountStatus: status,
    updatedAt: new Date(),
  };
  if (adminNotes !== undefined) {
    values.adminNotes = adminNotes;
  }

  const [updated] = await db
    .update(authUsers)
    .set(values)
    .where(and(eq(authUsers.id, id), isNull(authUsers.deletedAt)))
    .returning();
  return updated ?? null;
}
