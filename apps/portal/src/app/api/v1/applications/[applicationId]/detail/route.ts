import "server-only";
import { z } from "zod/v4";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  getApplicationDetailForEmployer,
  getTransitionHistory,
} from "@igbo/db/queries/portal-applications";
import { getNotesByApplicationId } from "@igbo/db/queries/portal-application-notes";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getSeekerTrustSignals } from "@igbo/db/queries/cross-app";

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  // Extract applicationId from URL: /api/v1/applications/{applicationId}/detail
  // "detail" is at(-1), applicationId is at(-2)
  const segments = new URL(req.url).pathname.split("/");
  const applicationId = segments.at(-2);

  const idValidation = z.string().uuid().safeParse(applicationId);
  if (!idValidation.success) {
    throw new ApiError({ title: "Invalid applicationId", status: 400 });
  }

  // Ownership check: 404-not-403 to prevent information leakage
  const company = await getCompanyByOwnerId(session.user.id);
  if (!company) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const application = await getApplicationDetailForEmployer(idValidation.data, company.id);
  if (!application) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Fetch supplementary data in parallel
  const [trustSignals, transitions, notes] = await Promise.all([
    getSeekerTrustSignals(application.seekerUserId),
    getTransitionHistory(idValidation.data),
    getNotesByApplicationId(idValidation.data),
  ]);

  return successResponse({ application, trustSignals, transitions, notes });
});
