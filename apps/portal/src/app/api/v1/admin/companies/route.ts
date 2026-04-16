import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { listAllCompaniesForAdmin } from "@igbo/db/queries/portal-admin-all-companies";
import type { VerificationDisplayStatus } from "@igbo/db/queries/portal-admin-all-companies";

const VALID_VERIFICATION_VALUES = new Set<string>([
  "verified",
  "pending",
  "rejected",
  "unverified",
]);

export const GET = withApiHandler(async (req) => {
  await requireJobAdminRole();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
  );

  const filters: { page: number; pageSize: number; verification?: VerificationDisplayStatus } = {
    page,
    pageSize,
  };

  const verification = url.searchParams.get("verification");
  if (verification && VALID_VERIFICATION_VALUES.has(verification)) {
    filters.verification = verification as VerificationDisplayStatus;
  }

  const result = await listAllCompaniesForAdmin(filters);
  return successResponse(result);
});
