import "server-only";
import { db } from "@igbo/db";
import { portalAdminReviews } from "@igbo/db/schema/portal-admin-reviews";
import { and, eq } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { checkFastLaneEligibility } from "@/services/admin-review-service";

/**
 * AC-6 Approval Integrity Rule.
 *
 * Validates that a posting may transition to `active` only if either:
 *   (a) an explicit `approved` admin review row exists in `portal_admin_reviews`, OR
 *   (b) fast-lane criteria are ALL met.
 *
 * Throws `PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION` (HTTP 403) otherwise.
 *
 * Callers MUST invoke this before any non-canonical path that sets a posting
 * status to `active`. The canonical admin-approval path
 * (`approvePosting` in admin-review-service) is safe by construction because
 * it inserts the review row before flipping the status inside a single
 * transaction; other code paths (e.g. generic `transitionStatus`) must call
 * this guard explicitly.
 */
export async function assertApprovalIntegrity(postingId: string): Promise<void> {
  const [approvedRow] = await db
    .select({ id: portalAdminReviews.id })
    .from(portalAdminReviews)
    .where(
      and(eq(portalAdminReviews.postingId, postingId), eq(portalAdminReviews.decision, "approved")),
    )
    .limit(1);

  if (approvedRow) return;

  const fastLane = await checkFastLaneEligibility(postingId);
  if (fastLane.eligible) return;

  throw new ApiError({
    title: "Approval integrity violation",
    status: 403,
    detail:
      "Cannot set status to active without an explicit admin approval or fast-lane eligibility",
    extensions: { code: PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION },
  });
}
