import "server-only";
import { z } from "zod/v4";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { getApplicationWithCurrentStatus } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { transition } from "@/services/application-state-machine";
import { portalApplicationStatusEnum } from "@igbo/db/schema/portal-applications";

const statusSchema = z.object({
  status: z.enum(portalApplicationStatusEnum.enumValues),
  reason: z.string().trim().max(500).optional(),
});

export const PATCH = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  // Extract applicationId from URL: /api/v1/applications/{applicationId}/status
  // "status" is at(-1), applicationId is at(-2)
  const segments = new URL(req.url).pathname.split("/");
  const applicationId = segments.at(-2);

  const idValidation = z.string().uuid().safeParse(applicationId);
  if (!idValidation.success) {
    throw new ApiError({ title: "Invalid applicationId", status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON" });
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  // Ownership check: 404-not-403 to prevent information leakage
  const application = await getApplicationWithCurrentStatus(idValidation.data);
  if (!application) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const company = await getCompanyByOwnerId(session.user.id);
  if (!company || company.id !== application.companyId) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Delegate to state machine — validates transitions + emits event
  await transition(
    idValidation.data,
    parsed.data.status,
    session.user.id,
    "employer",
    parsed.data.reason,
  );

  return successResponse({ applicationId: idValidation.data, status: parsed.data.status });
});
