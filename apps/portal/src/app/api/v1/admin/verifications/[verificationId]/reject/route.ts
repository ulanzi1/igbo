import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { rejectVerificationSchema } from "@/lib/validations/employer-verification";
import { rejectVerificationRequest } from "@/services/employer-verification-service";

export const POST = withApiHandler(async (req: Request) => {
  const { user } = await requireJobAdminRole();

  const verificationId = new URL(req.url).pathname.split("/").at(-2);
  if (!verificationId) {
    throw new Error("Missing verificationId");
  }

  const body = await req.json().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  });

  const parsed = rejectVerificationSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  await rejectVerificationRequest(verificationId, user.id, parsed.data.reason);
  return successResponse(null, undefined, 200);
});
