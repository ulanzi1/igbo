import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { flagPosting } from "@/services/admin-review-service";
import { createFlagSchema } from "@/lib/validations/admin-flag";

export const POST = withApiHandler(async (req: Request) => {
  const session = await requireJobAdminRole();

  // Extract jobId from URL: /api/v1/admin/jobs/{jobId}/flag
  const jobId = new URL(req.url).pathname.split("/").at(-2);
  if (!jobId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing jobId" });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Request body is required" });
  }

  const parsed = createFlagSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const { category, severity, description } = parsed.data;
  const flag = await flagPosting(jobId, session.user.id, category, severity, description);

  return successResponse(flag, undefined, 201);
});
