import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { isConversationMember, getConversationById } from "@/db/queries/chat-conversations";
import { messageService } from "@/services/message-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// ── GET /api/v1/conversations/[conversationId]/messages ───────────────────────

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  // Extract conversationId from URL path (withApiHandler doesn't pass Next.js params)
  const conversationId = new URL(request.url).pathname.split("/").at(-2);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }

  // Verify conversation exists and is not soft-deleted
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Conversation not found" });
  }

  // Verify requester is a member
  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const direction = (url.searchParams.get("direction") ?? "before") as "before" | "after";

  const limitParam = url.searchParams.get("limit");
  let limit: number | undefined;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 100) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Invalid 'limit' value: must be between 1 and 100",
      });
    }
    limit = parsed;
  }

  if (!["before", "after"].includes(direction)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid 'direction': must be 'before' or 'after'",
    });
  }

  const { messages, hasMore } = await messageService.getMessages(conversationId, {
    cursor,
    limit,
    direction,
  });

  const nextCursor = hasMore && messages.length > 0 ? messages[messages.length - 1]?.id : null;

  return successResponse({
    messages,
    meta: { cursor: nextCursor ?? null, hasMore },
  });
};

export const GET = withApiHandler(handler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `message-fetch:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MESSAGE_FETCH,
  },
});
