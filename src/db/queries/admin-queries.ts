import "server-only";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";

export async function findAdminByEmail(email: string) {
  return db
    .select()
    .from(authUsers)
    .where(and(eq(authUsers.email, email), isNull(authUsers.deletedAt)));
}

export async function insertAdminUser(email: string) {
  await db.insert(authUsers).values({
    email,
    role: "ADMIN",
    accountStatus: "APPROVED",
    consentGivenAt: new Date(),
  });
}
