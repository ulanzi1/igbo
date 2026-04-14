import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { getPlatformAnalytics } from "@/services/admin-analytics-service";

export const GET = withApiHandler(async () => {
  await requireJobAdminRole();
  const analytics = await getPlatformAnalytics();
  return successResponse(analytics);
});
