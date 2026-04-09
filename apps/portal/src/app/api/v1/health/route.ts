import { db } from "@igbo/db";
import { sql } from "drizzle-orm";

export async function GET() {
  // DB check is best-effort — don't fail the health check on cold-start timeouts.
  // The Dockerfile HEALTHCHECK has a 5s timeout; postgres cold connection can exceed that.
  const dbCheck = await db
    .execute(sql`SELECT 1`)
    .then(() => "ok" as const)
    .catch(() => "degraded" as const);

  return Response.json({ status: "ok", db: dbCheck });
}
