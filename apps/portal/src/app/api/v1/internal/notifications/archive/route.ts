import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/internal-auth";
import { successResponse } from "@/lib/api-response";
import { deleteOldPortalNotifications } from "@igbo/db/queries/portal-notifications";

const RETENTION_DAYS = 90;

export const POST = withApiHandler(
  async (req) => {
    requireInternalAuth(req);

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await deleteOldPortalNotifications(cutoff);

    return successResponse({ deleted });
  },
  { skipCsrf: true },
);
