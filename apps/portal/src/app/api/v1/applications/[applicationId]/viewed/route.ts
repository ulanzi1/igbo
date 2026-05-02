import "server-only";
import { z } from "zod/v4";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { recordApplicationView } from "@/services/application-view-service";

/**
 * POST /api/v1/applications/{applicationId}/viewed
 *
 * Records that an employer has viewed a candidate's application.
 * Implements the transactional outbox pattern for at-least-once delivery.
 *
 * Response:
 * - 200: First view — outbox event created, notification will be dispatched
 * - 204: Duplicate view — no new outbox event, viewed_at updated
 * - 401: Unauthenticated
 * - 403: Not an employer, or employer doesn't own the application's company
 * - 404: Application not found
 */
export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  // Extract applicationId: .../applications/{applicationId}/viewed
  const segments = new URL(req.url).pathname.split("/");
  const applicationId = segments.at(-2);

  const idValidation = z.string().uuid().safeParse(applicationId);
  if (!idValidation.success) {
    throw new ApiError({ title: "Invalid applicationId", status: 400 });
  }

  const { isFirstView } = await recordApplicationView(idValidation.data, session.user.id);

  if (isFirstView) {
    return successResponse({ ok: true });
  }

  // Duplicate view — return 204 No Content
  return new Response(null, { status: 204 });
});
