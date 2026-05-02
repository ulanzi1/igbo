import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/internal-auth";
import { successResponse } from "@/lib/api-response";
import { processOutboxBatch } from "@/services/outbox-poller";

/**
 * POST /api/v1/internal/outbox/process
 *
 * Internal cron-style endpoint — processes one batch of pending outbox events.
 * Protected by Authorization: Bearer <INTERNAL_JOB_SECRET>.
 * Safe to call multiple times concurrently (SKIP LOCKED prevents double-processing).
 *
 * Development use: call this manually or via an external scheduler after inserting
 * outbox events to trigger notification delivery.
 *
 * Production: this will be replaced by a standalone poller process (documented in P-6.5).
 */
export const POST = withApiHandler(
  async (req) => {
    requireInternalAuth(req);
    await (processOutboxBatch as () => Promise<void>)();
    return successResponse({ ok: true });
  },
  { skipCsrf: true },
);
