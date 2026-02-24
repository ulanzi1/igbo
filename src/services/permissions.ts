import "server-only";
import { findUserById } from "@/db/queries/auth-queries";
import { auth } from "@/server/auth/config";

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  return user?.role === "ADMIN";
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.id;
}

export async function requireAuthenticatedSession(): Promise<{ userId: string; role: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    const { ApiError } = await import("@/lib/api-error");
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
  return { userId: session.user.id, role: session.user.role };
}
