import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getReportsForPosting } from "@igbo/db/queries/portal-posting-reports";

export const GET = withApiHandler(async (req: Request) => {
  await requireJobAdminRole();

  const postingId = new URL(req.url).pathname.split("/").at(-1);
  if (!postingId) {
    throw new ApiError({ title: "Missing postingId", status: 400 });
  }

  const reports = await getReportsForPosting(postingId);
  if (reports.length === 0) {
    // Check if posting even exists — return 404 only if truly not found
    // (empty reports array is valid for a posting with no reports)
    return successResponse({ reports: [] });
  }

  return successResponse({ reports });
});
