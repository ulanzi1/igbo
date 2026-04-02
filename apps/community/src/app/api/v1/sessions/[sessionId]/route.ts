import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { revokeSession } from "@/services/auth-service";

export const DELETE = withApiHandler(async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const sessionId = new URL(request.url).pathname.split("/").pop() ?? "";
  if (!sessionId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "sessionId required" });
  }

  await revokeSession(sessionId, userId);

  return successResponse({ message: "Session revoked" });
});
