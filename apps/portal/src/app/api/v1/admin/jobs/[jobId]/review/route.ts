import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getReviewDetail } from "@/services/admin-review-service";

export const GET = withApiHandler(async (req: Request) => {
  await requireJobAdminRole();

  // Extract jobId from URL: /api/v1/admin/jobs/[jobId]/review → at(-2)
  const jobId = new URL(req.url).pathname.split("/").at(-2);
  if (!jobId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing jobId" });
  }

  const detail = await getReviewDetail(jobId);

  if (!detail) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Job posting not found" });
  }

  return successResponse(detail);
});
