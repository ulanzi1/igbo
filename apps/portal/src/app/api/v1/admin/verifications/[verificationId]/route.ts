import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  getVerificationById,
  getVerificationHistoryForCompany,
} from "@igbo/db/queries/portal-employer-verifications";
import { countOpenViolationsForCompany } from "@igbo/db/queries/portal-admin-flags";

export const GET = withApiHandler(async (req: Request) => {
  await requireJobAdminRole();

  const verificationId = new URL(req.url).pathname.split("/").at(-1);
  if (!verificationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing verificationId" });
  }

  const verification = await getVerificationById(verificationId);
  if (!verification) {
    throw new ApiError({
      title: "Verification not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.VERIFICATION_NOT_FOUND },
    });
  }

  const [history, openViolationCount] = await Promise.all([
    getVerificationHistoryForCompany(verification.companyId),
    countOpenViolationsForCompany(verification.companyId),
  ]);

  return successResponse({ ...verification, history, openViolationCount });
});
