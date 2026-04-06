import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { getDashboardSummary } from "@/services/admin-review-service";

export const GET = withApiHandler(async (_req: Request) => {
  await requireJobAdminRole();

  const summary = await getDashboardSummary();

  return successResponse(summary);
});
