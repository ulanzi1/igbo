import "server-only";
import { auth } from "@/server/auth/config";
import { ApiError } from "@/lib/api-error";

export async function requireAdminSession(_request?: Request): Promise<{ adminId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }
  return { adminId: session.user.id };
}
