import "server-only";
import { db } from "@igbo/db";
import { portalApplications } from "@igbo/db/schema/portal-applications";
import { getApplicationWithCurrentStatus } from "@igbo/db/queries/portal-applications";
import { recordApplicationViewRow } from "@igbo/db/queries/portal-application-views";
import { insertOutboxEvent } from "@igbo/db/queries/portal-outbox";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { ApiError } from "@/lib/api-error";
import { eq } from "drizzle-orm";

/**
 * Records a view of an application by an employer.
 *
 * Performs an atomic transaction:
 * 1. Inserts into portal_application_views (ON CONFLICT DO NOTHING for idempotency)
 * 2. Updates portal_applications.viewed_at ONLY on first view (timestamp stays aligned
 *    with when the seeker notification was sent — not overwritten by subsequent views)
 * 3. Inserts into portal_outbox ONLY on first view
 *
 * Authorization: the employer must own the company that owns the job posting.
 *
 * Returns { isFirstView: boolean }
 */
export async function recordApplicationView(
  applicationId: string,
  employerUserId: string,
): Promise<{ isFirstView: boolean }> {
  // Step 1: Look up application to get jobId, seekerUserId, companyId
  const application = await getApplicationWithCurrentStatus(applicationId);
  if (!application) {
    throw new ApiError({ title: "Application not found", status: 404 });
  }

  // Step 2: Verify employer owns the company that owns the job posting
  const company = await getCompanyByOwnerId(employerUserId);
  if (!company || company.id !== application.companyId) {
    throw new ApiError({
      title: "Forbidden — employer does not own this application's company",
      status: 403,
    });
  }

  // Step 3: Atomic transaction — dedup + first-view-only viewed_at update + outbox insert
  return db.transaction(async (tx) => {
    // 3a. Insert dedup row (ON CONFLICT DO NOTHING)
    const { isFirstView } = await recordApplicationViewRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle PgTransaction generic mismatch
      tx as any,
      applicationId,
      employerUserId,
    );

    if (isFirstView) {
      // 3b. Set viewed_at ONLY on first view — keeps the timestamp aligned with when
      //     the seeker notification was sent (not overwritten by subsequent views)
      await tx
        .update(portalApplications)
        .set({ viewedAt: new Date(), updatedAt: new Date() })
        .where(eq(portalApplications.id, applicationId));

      // 3c. Insert outbox event — guarantees at-most-one notification
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle PgTransaction generic mismatch
      await insertOutboxEvent(tx as any, "portal.application.viewed", {
        applicationId,
        jobId: application.jobId,
        seekerUserId: application.seekerUserId,
        employerUserId,
        companyId: application.companyId,
        timestamp: new Date().toISOString(),
      });
    }

    return { isFirstView };
  });
}
