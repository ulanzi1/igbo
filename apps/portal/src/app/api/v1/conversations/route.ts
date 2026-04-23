import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import * as conversationService from "@/services/conversation-service";

function parseLimit(param: string | null): number | undefined {
  if (!param) return undefined;
  const n = parseInt(param, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "limit must be a positive integer",
    });
  }
  return n;
}

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimit(url.searchParams.get("limit"));

  const result = await conversationService.listUserConversations(session.user.id, {
    cursor,
    limit,
  });

  return successResponse(result);
});
