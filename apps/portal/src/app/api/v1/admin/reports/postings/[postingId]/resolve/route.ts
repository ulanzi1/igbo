import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { resolveReportsSchema } from "@/lib/validations/posting-report";
import { resolveReportsWithAction } from "@/services/posting-report-service";

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobAdminRole();

  // Extract postingId from URL: /api/v1/admin/reports/postings/{postingId}/resolve
  const postingId = new URL(req.url).pathname.split("/").at(-2);
  if (!postingId) {
    throw new ApiError({ title: "Missing postingId", status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = resolveReportsSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const count = await resolveReportsWithAction(postingId, {
    resolvedByUserId: session.user.id,
    resolutionAction: parsed.data.resolutionAction,
    resolutionNote: parsed.data.resolutionNote,
  });

  return successResponse({ resolvedCount: count });
});
