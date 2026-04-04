import "server-only";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { companyProfileSchema } from "@/lib/validations/company";
import { createCompanyProfile, getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = companyProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const existing = await getCompanyByOwnerId(session.user.id);
  if (existing) {
    throw new ApiError({
      title: "Company profile already exists",
      status: 409,
      extensions: { code: PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE },
    });
  }

  const profile = await createCompanyProfile({
    ...parsed.data,
    ownerUserId: session.user.id,
  });

  return successResponse(profile, undefined, 201);
});

export const GET = withApiHandler(async (_req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  const profile = await getCompanyByOwnerId(session.user.id);

  return successResponse(profile ?? null);
});
