import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { sanitizeHtml } from "@/lib/sanitize";
import { editJobPostingSchema } from "@/lib/validations/job-posting";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getJobPostingWithCompany, updateJobPosting } from "@igbo/db/queries/portal-job-postings";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { canEditPosting, editActivePosting } from "@/services/job-posting-service";

export const GET = withApiHandler(async (req) => {
  const session = await requireEmployerRole();
  const company = await getCompanyByOwnerId(session.user.id);

  if (!company) {
    throw new ApiError({
      title: "Company profile required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.COMPANY_REQUIRED },
    });
  }

  const jobId = new URL(req.url).pathname.split("/").at(-1);
  if (!jobId) {
    throw new ApiError({ title: "Job ID required", status: 400 });
  }

  const result = await getJobPostingWithCompany(jobId);
  if (!result) {
    throw new ApiError({
      title: "Not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (result.posting.companyId !== company.id) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  return successResponse({ posting: result.posting, company: result.company });
});

export const PATCH = withApiHandler(async (req) => {
  const session = await requireEmployerRole();
  const company = await getCompanyByOwnerId(session.user.id);

  if (!company) {
    throw new ApiError({
      title: "Company profile required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.COMPANY_REQUIRED },
    });
  }

  const jobId = new URL(req.url).pathname.split("/").at(-1);
  if (!jobId) {
    throw new ApiError({ title: "Job ID required", status: 400 });
  }

  const result = await getJobPostingWithCompany(jobId);
  if (!result) {
    throw new ApiError({
      title: "Not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const { posting } = result;

  if (posting.companyId !== company.id) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  // Block editing when pending_review
  if (!canEditPosting(posting.status)) {
    throw new ApiError({
      title: "Cannot edit while under review",
      status: 403,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  const body: unknown = await req.json();
  const parsed = editJobPostingSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const {
    descriptionHtml,
    requirements,
    applicationDeadline,
    descriptionIgboHtml,
    culturalContextJson,
    expectedUpdatedAt,
    ...rest
  } = parsed.data;

  const sanitizedDesc = sanitizeHtml(descriptionHtml ?? "");
  const sanitizedReq = sanitizeHtml(requirements ?? "");
  const sanitizedIgboDesc = descriptionIgboHtml ? sanitizeHtml(descriptionIgboHtml) : null;

  const hasAnyCulturalContext =
    culturalContextJson &&
    (culturalContextJson.diasporaFriendly ||
      culturalContextJson.igboLanguagePreferred ||
      culturalContextJson.communityReferred);
  const storedContext = hasAnyCulturalContext ? culturalContextJson : null;

  const updateData = {
    ...rest,
    descriptionHtml: sanitizedDesc,
    requirements: sanitizedReq,
    descriptionIgboHtml: sanitizedIgboDesc,
    culturalContextJson: storedContext,
    applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
  };

  if (posting.status === "active") {
    // Atomic edit with pending_review transition
    await editActivePosting(
      jobId,
      company.id,
      updateData,
      expectedUpdatedAt ?? posting.updatedAt.toISOString(),
    );
  } else {
    // Simple update for draft, paused, rejected
    await updateJobPosting(jobId, updateData);
  }

  const updated = await getJobPostingWithCompany(jobId);
  return successResponse(updated ? { posting: updated.posting, company: updated.company } : null);
});
