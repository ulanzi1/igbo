import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { undoAction } from "@/services/admin-approval-service";
import { ApiError } from "@/lib/api-error";

export const DELETE = withApiHandler(async (request: Request) => {
  // Extract [id] from URL: /api/v1/admin/applications/[id]/action
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";

  const body = await request.json().catch(() => null);
  const undoFromStatus: unknown = body?.undoFromStatus;
  if (typeof undoFromStatus !== "string") {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "undoFromStatus is required",
    });
  }

  await undoAction(request, id, undoFromStatus);
  return successResponse({ message: "Action undone" });
});
