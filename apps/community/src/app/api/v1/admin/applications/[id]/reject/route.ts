import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { rejectApplication } from "@/services/admin-approval-service";

export const POST = withApiHandler(async (request: Request) => {
  // Extract [id] from URL: /api/v1/admin/applications/[id]/reject
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";

  const body = await request.json().catch(() => ({}));
  const reason: string | undefined = typeof body?.reason === "string" ? body.reason : undefined;

  await rejectApplication(request, id, reason);
  return successResponse({ message: "Application rejected" });
});
