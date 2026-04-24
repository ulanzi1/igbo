import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import * as conversationService from "@/services/conversation-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractApplicationId(url: string): string {
  const segments = new URL(url).pathname.split("/");
  // /api/v1/conversations/{applicationId}/read
  const idx = segments.indexOf("read");
  return segments[idx - 1] ?? "";
}

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const applicationId = extractApplicationId(req.url);
  if (!applicationId || !UUID_RE.test(applicationId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid applicationId" });
  }

  await conversationService.markConversationAsRead(applicationId, session.user.id);
  return successResponse({ success: true });
});
