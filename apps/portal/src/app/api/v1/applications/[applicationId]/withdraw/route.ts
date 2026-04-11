import "server-only";
import { z } from "zod/v4";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { getApplicationWithCurrentStatus } from "@igbo/db/queries/portal-applications";
import { transition } from "@/services/application-state-machine";

const withdrawSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  // Extract applicationId from URL: /api/v1/applications/{applicationId}/withdraw
  // "withdraw" is at(-1), applicationId is at(-2)
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
    body = {};
  }

  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  // Ownership check: 404-not-403 to prevent information leakage (P-2.6 pattern)
  const application = await getApplicationWithCurrentStatus(idValidation.data);
  if (!application || application.seekerUserId !== session.user.id) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Delegate to state machine — enforces terminal guard + emits application.withdrawn event
  // Hardcode "job_seeker" — requireJobSeekerRole already guarantees activePortalRole is JOB_SEEKER
  await transition(
    idValidation.data,
    "withdrawn",
    session.user.id,
    "job_seeker",
    parsed.data.reason,
  );

  return successResponse({ applicationId: idValidation.data, status: "withdrawn" });
});
