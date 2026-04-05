import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { auth } from "@igbo/auth";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { trackJobView } from "@/services/job-analytics-service";

export const POST = withApiHandler(async (req) => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const jobId = new URL(req.url).pathname.split("/").at(-2);
  if (!jobId) {
    throw new ApiError({ title: "Job ID required", status: 400 });
  }

  const tracked = await trackJobView(jobId, session.user.id);
  return successResponse({ tracked });
});
