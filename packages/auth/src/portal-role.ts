import "server-only";
import { auth } from "./config";

export type PortalRole = "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";

/**
 * Get the active portal role for the current session.
 * Returns the role stored in the JWT (`activePortalRole`), populated at sign-in
 * from the `auth_user_roles` RBAC table. Priority: JOB_SEEKER > EMPLOYER > JOB_ADMIN.
 * Returns null if user has no portal roles assigned.
 */
export async function getActivePortalRole(): Promise<PortalRole | null> {
  const session = await auth();
  return (session?.user?.activePortalRole as PortalRole | null | undefined) ?? null;
}
