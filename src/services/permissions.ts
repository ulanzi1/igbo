import "server-only";
import { findUserById } from "@/db/queries/auth-queries";

/**
 * Single source of RBAC truth for admin checks.
 * Used by API handlers and service layer.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  return user?.role === "ADMIN";
}
