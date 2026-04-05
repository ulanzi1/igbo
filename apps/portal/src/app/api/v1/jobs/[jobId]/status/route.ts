import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { statusTransitionSchema } from "@/lib/validations/job-posting";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  transitionStatus,
  closePosting,
  submitForReview,
  renewPosting,
} from "@/services/job-posting-service";

export const PATCH = withApiHandler(async (req) => {
  // Employer-only route — admin approval route added in Epic 3
  const session = await requireEmployerRole();

  const company = await getCompanyByOwnerId(session.user.id);

  if (!company) {
    throw new ApiError({
      title: "Company profile required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.COMPANY_REQUIRED },
    });
  }

  // Extract jobId from /api/v1/jobs/[jobId]/status — jobId is at position -2
  const jobId = new URL(req.url).pathname.split("/").at(-2);
  if (!jobId) {
    throw new ApiError({ title: "Job ID required", status: 400 });
  }

  const body: unknown = await req.json();
  const parsed = statusTransitionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const { targetStatus, closedOutcome, expectedUpdatedAt, newExpiresAt, contentChanged } =
    parsed.data;

  // Branch: "filled" must use closePosting to record closedOutcome/closedAt
  if (targetStatus === "filled") {
    if (!closedOutcome) {
      throw new ApiError({
        title: "closedOutcome is required when closing a posting",
        status: 400,
      });
    }
    await closePosting(jobId, closedOutcome, company.id);
    return successResponse({ status: "filled", closedOutcome });
  }

  // For submit-for-review (draft → pending_review), use dedicated function with field validation
  if (targetStatus === "pending_review") {
    await submitForReview(jobId, company.id);
    return successResponse({ status: "pending_review" });
  }

  // Renew expired posting (expired → active, contentChanged=false)
  if (targetStatus === "active") {
    const { getJobPostingById } = await import("@igbo/db/queries/portal-job-postings");
    const posting = await getJobPostingById(jobId);
    if (posting?.status === "expired") {
      if (!newExpiresAt) {
        throw new ApiError({
          title: "newExpiresAt is required when renewing an expired posting",
          status: 400,
        });
      }
      await renewPosting(jobId, company.id, newExpiresAt, contentChanged ?? false, "EMPLOYER");
      return successResponse({ status: "active" });
    }
  }

  // All other employer transitions (pause, unpause)
  await transitionStatus(jobId, targetStatus, company.id, "EMPLOYER", {
    expectedUpdatedAt,
  });

  return successResponse({ status: targetStatus });
});
