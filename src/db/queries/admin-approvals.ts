import "server-only";
import { eq, isNull, and, count } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";
import { communityProfiles } from "@/db/schema/community-profiles";
import type { AuthUser } from "@/db/schema/auth-users";

export type ApplicationStatus = "PENDING_APPROVAL" | "APPROVED" | "INFO_REQUESTED" | "REJECTED";

export interface ListApplicationsOptions {
  status?: ApplicationStatus;
  page?: number;
  pageSize?: number;
}

/** An application row augmented with profile completion status. */
export type ApplicationWithProfileStatus = AuthUser & {
  profileIncomplete: boolean;
};

export interface ApplicationListResult {
  data: ApplicationWithProfileStatus[];
  meta: { page: number; pageSize: number; total: number };
}

/**
 * Lists applications filtered by status with offset pagination.
 * LEFT JOINs community_profiles to surface the "Profile incomplete" indicator
 * for APPROVED members who have not completed onboarding.
 * Always excludes soft-deleted rows.
 */
export async function listApplications(
  options: ListApplicationsOptions = {},
): Promise<ApplicationListResult> {
  const { status = "PENDING_APPROVAL", page = 1, pageSize = 20 } = options;
  const offset = (page - 1) * pageSize;

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        // All auth_users fields
        id: authUsers.id,
        email: authUsers.email,
        emailVerified: authUsers.emailVerified,
        name: authUsers.name,
        phone: authUsers.phone,
        locationCity: authUsers.locationCity,
        locationState: authUsers.locationState,
        locationCountry: authUsers.locationCountry,
        culturalConnection: authUsers.culturalConnection,
        reasonForJoining: authUsers.reasonForJoining,
        referralName: authUsers.referralName,
        consentGivenAt: authUsers.consentGivenAt,
        consentIp: authUsers.consentIp,
        consentVersion: authUsers.consentVersion,
        image: authUsers.image,
        accountStatus: authUsers.accountStatus,
        passwordHash: authUsers.passwordHash,
        role: authUsers.role,
        membershipTier: authUsers.membershipTier,
        languagePreference: authUsers.languagePreference,
        scheduledDeletionAt: authUsers.scheduledDeletionAt,
        adminNotes: authUsers.adminNotes,
        deletedAt: authUsers.deletedAt,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
        // Profile completion indicator
        profileCompletedAt: communityProfiles.profileCompletedAt,
      })
      .from(authUsers)
      .leftJoin(communityProfiles, eq(communityProfiles.userId, authUsers.id))
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
    data: rows.map((row) => ({
      ...row,
      profileIncomplete: status === "APPROVED" && !row.profileCompletedAt,
    })),
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
