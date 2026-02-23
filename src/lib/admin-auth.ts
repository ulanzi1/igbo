import "server-only";
import { findUserById } from "@/db/queries/auth-queries";
import { ApiError } from "@/lib/api-error";

/**
 * Extracts and validates admin identity from the request.
 * TODO: Story 1.7 replaces this stub with Auth.js auth() session extraction.
 * For now, reads X-Admin-Id header (set by dev tooling/tests only; never exposed in prod middleware).
 */
export async function requireAdminSession(request: Request): Promise<{ adminId: string }> {
  const adminId = request.headers.get("X-Admin-Id");
  if (!adminId) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
  const user = await findUserById(adminId);
  if (!user || user.role !== "ADMIN") {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }
  return { adminId };
}
