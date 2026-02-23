import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requestMoreInfo } from "@/services/admin-approval-service";
import { ApiError } from "@/lib/api-error";

export const POST = withApiHandler(async (request: Request) => {
  // Extract [id] from URL: /api/v1/admin/applications/[id]/request-info
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";

  const body = await request.json().catch(() => null);
  const message: unknown = body?.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "message is required",
    });
  }

  await requestMoreInfo(request, id, message.trim());
  return successResponse({ message: "Information requested" });
});
