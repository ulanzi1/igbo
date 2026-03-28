import "server-only";
import { auth } from "@/server/auth/config";
import { ApiError } from "@/lib/api-error";
import { findUserById } from "@/db/queries/auth-queries";

export async function requireAdminSession(_request?: Request): Promise<{ adminId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }
  // Verify admin account exists and is not suspended, banned, or inactive
  const user = await findUserById(session.user.id);
  if (!user) {
    throw new ApiError({ title: "Unauthorized", status: 401, detail: "User not found" });
  }
  if (
    user.accountStatus === "BANNED" ||
    user.accountStatus === "SUSPENDED" ||
    user.accountStatus === "PENDING_DELETION" ||
    user.accountStatus === "ANONYMIZED"
  ) {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }
  return { adminId: session.user.id };
}
