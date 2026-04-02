import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { approveApplication } from "@/services/admin-approval-service";

export const POST = withApiHandler(async (request: Request) => {
  // Extract [id] from URL: /api/v1/admin/applications/[id]/approve
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
  await approveApplication(request, id);
  return successResponse({ message: "Application approved" });
});
