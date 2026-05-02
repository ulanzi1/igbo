import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/internal-auth";
import { successResponse } from "@/lib/api-response";
import { cleanupProcessedOutboxEvents } from "@/services/outbox-poller";

const CLEANUP_OLDER_THAN_DAYS = 7;

/**
 * POST /api/v1/internal/outbox/cleanup
 *
 * Internal cron-style endpoint — purges processed outbox events older than 7 days.
 * Protected by Authorization: Bearer <INTERNAL_JOB_SECRET>.
 * Returns the number of deleted rows.
 */
export const POST = withApiHandler(
  async (req) => {
    requireInternalAuth(req);
    const deleted = await cleanupProcessedOutboxEvents(CLEANUP_OLDER_THAN_DAYS);
    return successResponse({ deleted });
  },
  { skipCsrf: true },
);
