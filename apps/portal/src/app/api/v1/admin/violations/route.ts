import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { getViolationsQueue } from "@/services/admin-review-service";

export const GET = withApiHandler(async (req: Request) => {
  await requireJobAdminRole();

  const url = new URL(req.url);
  const limit = Math.max(
    1,
    Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 100),
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const result = await getViolationsQueue({ limit, offset });
  return successResponse(result);
});
