import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import {
  isConversationMember,
  getConversationById,
  markConversationRead,
  getConversationWithMembers,
} from "@/db/queries/chat-conversations";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// ── GET /api/v1/conversations/[conversationId] ────────────────────────────────

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const conversationId = new URL(request.url).pathname.split("/").at(-1);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Conversation not found" });
  }

  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  // For group conversations, enrich response with member profiles
  if (conversation.type === "group") {
    const withMembers = await getConversationWithMembers(conversationId);
    return successResponse({
      conversation: {
        ...conversation,
        members: withMembers?.members ?? [],
        memberCount: withMembers?.memberCount ?? 0,
      },
    });
  }

  return successResponse({ conversation });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `conversation-read:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.CONVERSATION_READ,
  },
});

// ── PATCH /api/v1/conversations/[conversationId] ──────────────────────────────

const patchHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const conversationId = new URL(request.url).pathname.split("/").at(-1);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }

  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  await markConversationRead(conversationId, userId);

  return successResponse({ ok: true });
};

export const PATCH = withApiHandler(patchHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `conversation-mark-read:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.CONVERSATION_MARK_READ,
  },
});
