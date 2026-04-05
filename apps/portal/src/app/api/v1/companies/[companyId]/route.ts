import "server-only";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { companyProfileSchema } from "@/lib/validations/company";
import { getCompanyById, updateCompanyProfile } from "@igbo/db/queries/portal-companies";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const companyId = new URL(req.url).pathname.split("/").at(-1);
  if (!companyId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing company ID" });
  }

  const profile = await getCompanyById(companyId);
  if (!profile) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Company not found" });
  }

  const trustSignals = await getCommunityTrustSignals(profile.ownerUserId);

  return successResponse({ ...profile, trustSignals });
});

export const PATCH = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  const companyId = new URL(req.url).pathname.split("/").at(-1);
  if (!companyId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing company ID" });
  }

  const profile = await getCompanyById(companyId);
  if (!profile) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Company not found" });
  }

  if (profile.ownerUserId !== session.user.id) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "You do not own this company profile",
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = companyProfileSchema.partial().safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const updated = await updateCompanyProfile(companyId, parsed.data);

  return successResponse(updated);
});
