import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { resolveFlagWithAction } from "@/services/admin-review-service";
import { resolveFlagSchema } from "@/lib/validations/admin-flag";

export const POST = withApiHandler(async (req: Request) => {
  const session = await requireJobAdminRole();

  // Extract flagId from URL: /api/v1/admin/flags/{flagId}/resolve
  const flagId = new URL(req.url).pathname.split("/").at(-2);
  if (!flagId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing flagId" });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Request body is required" });
  }

  const parsed = resolveFlagSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const { action, note } = parsed.data;
  await resolveFlagWithAction(flagId, session.user.id, action, note);

  return successResponse(null);
});
