import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { shareJobToCommunity } from "@/services/job-analytics-service";

export const POST = withApiHandler(async (req) => {
  const session = await requireEmployerRole();
  const company = await getCompanyByOwnerId(session.user.id);

  if (!company) {
    throw new ApiError({
      title: "Company profile required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.COMPANY_REQUIRED },
    });
  }

  const jobId = new URL(req.url).pathname.split("/").at(-2);
  if (!jobId) {
    throw new ApiError({ title: "Job ID required", status: 400 });
  }

  const result = await shareJobToCommunity(jobId, company.id, session.user.id);

  if (!result.success && result.reason === "already_shared") {
    throw new ApiError({
      title: "Already shared to community",
      status: 409,
      extensions: { code: PORTAL_ERRORS.ALREADY_SHARED },
    });
  }

  return successResponse({ success: result.success, communityPostId: result.communityPostId });
});
