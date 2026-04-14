import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { approveVerificationRequest } from "@/services/employer-verification-service";

export const POST = withApiHandler(async (req: Request) => {
  const { user } = await requireJobAdminRole();

  const verificationId = new URL(req.url).pathname.split("/").at(-2);
  if (!verificationId) {
    throw new Error("Missing verificationId");
  }

  await approveVerificationRequest(verificationId, user.id);
  return successResponse(null, undefined, 200);
});
