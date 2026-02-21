import { sql } from "drizzle-orm";
import { db } from "@/db";

// Note: auth_users is managed by Auth.js (next-auth) and is not yet in the Drizzle schema.
// These queries use the drizzle sql template for safety while the schema is added in Story 1.2.
// TODO: Replace with typed Drizzle schema references once auth_users is added.

export async function findAdminByEmail(email: string) {
  const result = await db.execute(
    sql`SELECT id FROM auth_users WHERE email = ${email} LIMIT 1`,
  );
  return result;
}

export async function insertAdminUser(email: string) {
  await db.execute(
    sql`INSERT INTO auth_users (email, role) VALUES (${email}, 'admin')`,
  );
}
