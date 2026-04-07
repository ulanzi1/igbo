import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import {
  getReviewDetail,
  approvePosting,
  rejectPosting,
  requestChanges,
} from "@/services/admin-review-service";
import { adminReviewDecisionSchema } from "@/lib/validations/admin-review";

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

export const POST = withApiHandler(async (req: Request) => {
  const session = await requireJobAdminRole();
  const reviewerUserId = session.user.id;

  // Extract jobId from URL: /api/v1/admin/jobs/[jobId]/review → at(-2)
  const jobId = new URL(req.url).pathname.split("/").at(-2);
  if (!jobId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing jobId" });
  }

  const body = await req.json().catch(() => null);
  const parsed = adminReviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const data = parsed.data;

  if (data.decision === "approved") {
    await approvePosting(jobId, reviewerUserId);
  } else if (data.decision === "rejected") {
    await rejectPosting(jobId, reviewerUserId, data.reason, data.category);
  } else {
    await requestChanges(jobId, reviewerUserId, data.feedbackComment);
  }

  return successResponse({ decision: data.decision, postingId: jobId }, undefined, 201);
});
