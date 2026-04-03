import "server-only";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../index";
import { authUsers } from "../schema/auth-users";
import { authRoles, authUserRoles } from "../schema/auth-permissions";
import type { AuthUser } from "../schema/auth-users";
import type { AuthRole, NewAuthUserRole } from "../schema/auth-permissions";

export type MembershipTier = "BASIC" | "PROFESSIONAL" | "TOP_TIER";

export async function getUserMembershipTier(userId: string): Promise<MembershipTier> {
  const [user] = await db
    .select({ membershipTier: authUsers.membershipTier })
    .from(authUsers)
    .where(and(eq(authUsers.id, userId), isNull(authUsers.deletedAt)))
    .limit(1);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  return user.membershipTier;
}

export async function updateUserMembershipTier(
  userId: string,
  tier: MembershipTier,
  _assignedBy: string,
): Promise<void> {
  await db
    .update(authUsers)
    .set({ membershipTier: tier, updatedAt: new Date() })
    .where(and(eq(authUsers.id, userId), isNull(authUsers.deletedAt)));
}

export async function getUsersWithTier(
  tier: MembershipTier,
  options?: { limit?: number; offset?: number },
): Promise<AuthUser[]> {
  const query = db
    .select()
    .from(authUsers)
    .where(
      and(
        eq(authUsers.membershipTier, tier),
        eq(authUsers.accountStatus, "APPROVED"),
        isNull(authUsers.deletedAt),
      ),
    )
    .limit(options?.limit ?? 20)
    .offset(options?.offset ?? 0);

  return query;
}

export async function getRoleByName(name: string): Promise<AuthRole | null> {
  const [role] = await db.select().from(authRoles).where(eq(authRoles.name, name)).limit(1);

  return role ?? null;
}

export async function assignUserRole(
  userId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const values: NewAuthUserRole = {
    userId,
    roleId,
    assignedBy: assignedBy ?? null,
  };

  await db.insert(authUserRoles).values(values).onConflictDoNothing();
}

export async function getUserRoles(userId: string): Promise<AuthRole[]> {
  const rows = await db
    .select({ role: authRoles })
    .from(authUserRoles)
    .innerJoin(authRoles, eq(authUserRoles.roleId, authRoles.id))
    .where(eq(authUserRoles.userId, userId));

  return rows.map((r) => r.role);
}

type PortalRole = "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";

/**
 * Get portal roles for a user from the auth_user_roles RBAC table.
 * Requires migration 0050 (auth_roles rows for JOB_SEEKER/EMPLOYER/JOB_ADMIN).
 */
export async function getUserPortalRoles(userId: string): Promise<PortalRole[]> {
  const PORTAL_ROLE_NAMES = new Set<string>(["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"]);
  const roles = await getUserRoles(userId);
  return roles.map((r) => r.name).filter((n): n is PortalRole => PORTAL_ROLE_NAMES.has(n));
}
