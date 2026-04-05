import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { JOB_TEMPLATES } from "@/lib/job-templates";

export const GET = withApiHandler(
  async (_req) => {
    return successResponse(JOB_TEMPLATES);
  },
  { skipCsrf: true },
);
