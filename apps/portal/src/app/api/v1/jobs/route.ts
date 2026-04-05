import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { sanitizeHtml } from "@/lib/sanitize";
import { jobPostingSchema } from "@/lib/validations/job-posting";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { createJobPosting, getJobPostingsByCompanyId } from "@igbo/db/queries/portal-job-postings";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

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

  const body: unknown = await req.json();
  const parsed = jobPostingSchema.safeParse(body);
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
    expiresAt,
    descriptionIgboHtml,
    culturalContextJson,
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

  const posting = await createJobPosting({
    ...rest,
    descriptionHtml: sanitizedDesc,
    requirements: sanitizedReq,
    descriptionIgboHtml: sanitizedIgboDesc,
    culturalContextJson: storedContext,
    companyId: company.id,
    status: "draft",
    applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  return successResponse(posting, undefined, 201);
});

export const GET = withApiHandler(async (_req) => {
  const session = await requireEmployerRole();
  const company = await getCompanyByOwnerId(session.user.id);

  if (!company) {
    return successResponse([]);
  }

  const postings = await getJobPostingsByCompanyId(company.id);
  return successResponse(postings);
});
