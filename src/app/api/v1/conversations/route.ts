import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getUserConversations, createConversation } from "@/db/queries/chat-conversations";
import { isBlocked } from "@/db/queries/block-mute";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// ── GET /api/v1/conversations ─────────────────────────────────────────────────

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  let limit: number | undefined;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 50) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Invalid 'limit' value: must be between 1 and 50",
      });
    }
    limit = parsed;
  }

  const { conversations, hasMore } = await getUserConversations(userId, { limit, cursor });
  const nextCursor =
    hasMore && conversations.length > 0
      ? conversations[conversations.length - 1]?.updatedAt.toISOString()
      : null;
  return successResponse({ conversations, meta: { cursor: nextCursor, hasMore } });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `conversation-list:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.CONVERSATION_LIST,
  },
});

// ── POST /api/v1/conversations ────────────────────────────────────────────────

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const { type, memberIds } = body as { type?: unknown; memberIds?: unknown };

  if (!type || !["direct", "group", "channel"].includes(type as string)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid 'type': must be 'direct', 'group', or 'channel'",
    });
  }

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "memberIds must be a non-empty array",
    });
  }

  const otherMemberIds = (memberIds as string[]).filter((id) => id !== userId);

  // Block check: cannot create conversation with anyone who has blocked you
  for (const memberId of otherMemberIds) {
    const blocked = await isBlocked(memberId, userId);
    if (blocked) {
      throw new ApiError({
        title: "Forbidden",
        status: 403,
        detail: "Cannot create conversation with this user",
      });
    }
  }

  // Always include the creator in the conversation
  const allMemberIds = Array.from(new Set([userId, ...otherMemberIds]));
  const conversation = await createConversation(
    type as "direct" | "group" | "channel",
    allMemberIds,
  );

  return successResponse({ conversation }, undefined, 201);
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `conversation-create:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.CONVERSATION_CREATE,
  },
});
