import "server-only";
import { z } from "zod/v4";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { getApplicationsByIds } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";
import { transition, VALID_TRANSITIONS } from "@/services/application-state-machine";

/**
 * P-2.10: Bulk status transition for applications.
 *
 * Each application is transitioned individually via the state machine —
 * this is NOT a batch SQL update. The N transition() calls each emit
 * their own `application.status_changed` event and write to the audit
 * transitions table. Terminal-state candidates are skipped with a
 * structured error in the response.
 *
 * Ownership is verified via a single batched query before any
 * transitions run (404-not-403 fail-closed if ANY id is not owned).
 */

const bulkSchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(["advance", "reject"]),
  reason: z.string().max(500).optional(),
});

/**
 * Computes the next forward status for a given current status. Returns
 * `null` when the application is in a terminal state or has no valid
 * non-reject employer transition. Reads from `VALID_TRANSITIONS` in the
 * state machine so it stays in sync with the canonical rules.
 *
 * Route-specific advance policy — NOT a general-purpose helper. Do not
 * move into `application-state-machine.ts`.
 */
function getNextAdvanceStatus(
  currentStatus: PortalApplicationStatus,
): PortalApplicationStatus | null {
  const rules = VALID_TRANSITIONS[currentStatus] ?? [];
  const forwardRule = rules.find(
    (r) => r.allowedActors.includes("employer") && r.toStatus !== "rejected",
  );
  return forwardRule?.toStatus ?? null;
}

interface BulkResultItem {
  applicationId: string;
  status: "processed" | "skipped";
  error?: string;
}

export const PATCH = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  const body = (await req.json()) as unknown;
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: parsed.error.issues[0]?.message ?? "Validation failed",
      status: 400,
    });
  }
  // Deduplicate to prevent false-404 when client accidentally sends duplicate IDs
  const applicationIds = [...new Set(parsed.data.applicationIds)];
  const { action, reason } = parsed.data;

  // Verify ownership for the whole batch in one query
  const company = await getCompanyByOwnerId(session.user.id);
  if (!company) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const owned = await getApplicationsByIds(applicationIds, company.id);
  if (owned.length !== applicationIds.length) {
    // Fail-closed: if any id is missing (wrong company or doesn't exist)
    // return 404 for the whole request to avoid leaking which specific
    // ids belong to other employers.
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const results: BulkResultItem[] = [];
  let processed = 0;
  let skipped = 0;

  for (const app of owned) {
    let targetStatus: PortalApplicationStatus | null;
    if (action === "reject") {
      // Skip applications already in terminal state (no valid transitions)
      // rather than wasting a transition() call + DB transaction that will throw.
      const hasTransitions = (VALID_TRANSITIONS[app.status] ?? []).length > 0;
      targetStatus = hasTransitions ? "rejected" : null;
    } else {
      targetStatus = getNextAdvanceStatus(app.status);
    }

    if (!targetStatus) {
      skipped += 1;
      results.push({
        applicationId: app.id,
        status: "skipped",
        error: "No valid next stage",
      });
      continue;
    }

    try {
      await transition(app.id, targetStatus, session.user.id, "employer", reason);
      processed += 1;
      results.push({ applicationId: app.id, status: "processed" });
    } catch (err) {
      skipped += 1;
      const msg = err instanceof Error ? err.message : "Transition failed";
      results.push({ applicationId: app.id, status: "skipped", error: msg });
    }
  }

  return successResponse({ processed, skipped, results });
});
