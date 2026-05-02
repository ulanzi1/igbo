import "server-only";
import { db } from "../index";
import { portalApplicationViews } from "../schema/portal-outbox";
import { portalApplications } from "../schema/portal-applications";
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Inserts a view record for (applicationId, employerUserId) using ON CONFLICT DO NOTHING.
 * Returns `{ isFirstView: true }` when a new row was inserted, `{ isFirstView: false }` for duplicates.
 *
 * Called inside a db.transaction alongside viewed_at update and outbox insert.
 */
export async function recordApplicationViewRow(
  tx: PgTransaction<any, any, any>,
  applicationId: string,
  employerUserId: string,
): Promise<{ isFirstView: boolean }> {
  const result = await tx.execute(sql`
    INSERT INTO portal_application_views (application_id, employer_user_id)
    VALUES (${applicationId}, ${employerUserId})
    ON CONFLICT (application_id, employer_user_id) DO NOTHING
  `);
  const rowCount = (result as any).count ?? 0;
  return { isFirstView: rowCount > 0 };
}

/**
 * Returns the viewed_at timestamp for an application (denormalized convenience field).
 * Returns null if not yet viewed.
 */
export async function getApplicationViewedAt(applicationId: string): Promise<Date | null> {
  const rows = await db
    .select({ viewedAt: portalApplications.viewedAt })
    .from(portalApplications)
    .where(eq(portalApplications.id, applicationId));
  return rows[0]?.viewedAt ?? null;
}

/**
 * Returns true if the given employer has viewed the application at least once.
 */
export async function hasEmployerViewedApplication(
  applicationId: string,
  employerUserId: string,
): Promise<boolean> {
  const rows = await db
    .select({ applicationId: portalApplicationViews.applicationId })
    .from(portalApplicationViews)
    .where(
      and(
        eq(portalApplicationViews.applicationId, applicationId),
        eq(portalApplicationViews.employerUserId, employerUserId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
