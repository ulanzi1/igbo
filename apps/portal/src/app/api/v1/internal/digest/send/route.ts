import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/internal-auth";
import { successResponse } from "@/lib/api-response";
import { sendPendingDigests } from "@/services/digest-sender";

/**
 * POST /api/v1/internal/digest/send
 *
 * Internal cron endpoint: sends pending notification digest emails to all users
 * whose digest is due (daily at 8 AM local, or weekly on Monday 8 AM local).
 *
 * Authentication: Bearer {INTERNAL_JOB_SECRET}
 * CSRF: disabled (machine-to-machine, no browser Origin header)
 */
export const POST = withApiHandler(
  async (req) => {
    requireInternalAuth(req);
    const result = await sendPendingDigests(new Date());
    return successResponse(result);
  },
  { skipCsrf: true },
);
