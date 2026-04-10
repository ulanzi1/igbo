import "server-only";
import { z } from "zod/v4";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { getApplicationsWithSeekerDataByJobId } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  // Extract jobId from URL: /api/v1/jobs/{jobId}/applications
  // "applications" is at(-1), jobId is at(-2)
  const segments = new URL(req.url).pathname.split("/");
  const jobId = segments.at(-2);

  const idValidation = z.string().uuid().safeParse(jobId);
  if (!idValidation.success) {
    throw new ApiError({ title: "Invalid jobId", status: 400 });
  }

  // Verify employer owns the job posting
  const company = await getCompanyByOwnerId(session.user.id);
  if (!company) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const posting = await getJobPostingById(idValidation.data);
  if (!posting || posting.companyId !== company.id) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const applications = await getApplicationsWithSeekerDataByJobId(idValidation.data);

  return successResponse({ applications });
});
