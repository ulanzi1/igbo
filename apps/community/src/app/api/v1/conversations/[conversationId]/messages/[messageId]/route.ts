import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { isConversationMember, getConversationById } from "@/db/queries/chat-conversations";
import { messageService } from "@/services/message-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// URL extraction: /api/v1/conversations/{4}/messages/{6}
// parts: ["", "api", "v1", "conversations", conversationId, "messages", messageId]
function extractIds(request: Request): { conversationId: string; messageId: string } | null {
  const parts = new URL(request.url).pathname.split("/");
  const conversationId = parts[4];
  const messageId = parts[6];
  if (!conversationId || !messageId) return null;
  return { conversationId, messageId };
}

function mapServiceError(
  err: unknown,
): { status: 403 | 404 | 410; title: string; detail: string } | null {
  if (!(err instanceof Error)) return null;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "NOT_FOUND") return { status: 404, title: "Not Found", detail: err.message };
  if (code === "FORBIDDEN") return { status: 403, title: "Forbidden", detail: err.message };
  if (code === "GONE") return { status: 410, title: "Gone", detail: err.message };
  return null;
}

// ── PATCH /api/v1/conversations/[conversationId]/messages/[messageId] ────────

const patchHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const ids = extractIds(request);
  if (!ids) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing path parameters" });
  }
  const { conversationId, messageId } = ids;

  // Verify conversation exists
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

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const schema = z.object({ content: z.string().min(1).max(4000) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  try {
    const updatedMessage = await messageService.updateMessage(
      messageId,
      userId,
      parsed.data.content,
    );
    return successResponse(updatedMessage);
  } catch (err) {
    const mapped = mapServiceError(err);
    if (mapped) {
      throw new ApiError(mapped);
    }
    throw err;
  }
};

// ── DELETE /api/v1/conversations/[conversationId]/messages/[messageId] ───────

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const ids = extractIds(request);
  if (!ids) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing path parameters" });
  }
  const { conversationId, messageId } = ids;

  // Verify conversation exists
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

  try {
    await messageService.deleteMessage(messageId, userId);
    return new Response(null, { status: 204 });
  } catch (err) {
    const mapped = mapServiceError(err);
    if (mapped) {
      throw new ApiError(mapped);
    }
    throw err;
  }
};

export const PATCH = withApiHandler(patchHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `message-edit:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MESSAGE_EDIT,
  },
});

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `message-delete:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MESSAGE_DELETE,
  },
});
