import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import {
  getUserConversations,
  createConversation,
  findExistingDirectConversation,
  getConversationById,
  checkBlocksAmongMembers,
} from "@igbo/db/queries/chat-conversations";
import { isBlocked, getBlockedUserIds } from "@igbo/db/queries/block-mute";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { MAX_GROUP_MEMBERS } from "@igbo/config/chat";
import { eventBus } from "@/services/event-bus";

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

  const blockedUserIds = await getBlockedUserIds(userId);
  const { conversations, hasMore } = await getUserConversations(userId, {
    limit,
    cursor,
    blockedUserIds,
  });
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

  // Validate all memberIds are valid UUID v4 strings
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of memberIds as unknown[]) {
    if (typeof id !== "string" || !uuidRegex.test(id)) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "All memberIds must be valid UUIDs",
      });
    }
  }

  const otherMemberIds = (memberIds as string[]).filter((id) => id !== userId);

  // Prevent self-conversations for direct type
  if (type === "direct" && otherMemberIds.length === 0) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Cannot create a direct conversation with yourself",
    });
  }

  // Group type requires 2–49 other members (3–50 total with creator)
  // Deduplicate memberIds before validation to prevent "group" with only 2 unique members
  const uniqueOtherMemberIds = Array.from(new Set(otherMemberIds));
  if (type === "group") {
    if (uniqueOtherMemberIds.length < 2) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: "Group conversations require at least 2 other members",
      });
    }
    if (uniqueOtherMemberIds.length > MAX_GROUP_MEMBERS - 1) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `Group conversations cannot exceed ${MAX_GROUP_MEMBERS} members`,
      });
    }
  }

  // For direct conversations: return existing if one already exists (idempotent)
  if (type === "direct" && otherMemberIds.length === 1) {
    const existingId = await findExistingDirectConversation(userId, otherMemberIds[0]!);
    if (existingId) {
      const existing = await getConversationById(existingId);
      if (existing) {
        return successResponse({ conversation: existing }, undefined, 200);
      }
    }
  }

  // Always include the creator in the conversation
  const allMemberIds = [userId, ...uniqueOtherMemberIds];

  // Block check: bidirectional for direct, all-pairs for groups
  if (type === "group") {
    // Group: check ALL member pairs for block relationships (single SQL query)
    const hasBlockConflict = await checkBlocksAmongMembers(allMemberIds);
    if (hasBlockConflict) {
      throw new ApiError({
        title: "Forbidden",
        status: 403,
        detail: "Cannot create conversation with this user",
      });
    }
  } else {
    // Direct: check if either party blocked the other
    for (const memberId of uniqueOtherMemberIds) {
      const blockedByThem = await isBlocked(memberId, userId);
      const blockedByMe = await isBlocked(userId, memberId);
      if (blockedByThem || blockedByMe) {
        throw new ApiError({
          title: "Forbidden",
          status: 403,
          detail: "Cannot create conversation with this user",
        });
      }
    }
  }
  const conversation = await createConversation(
    type as "direct" | "group" | "channel",
    allMemberIds,
  );

  // For group conversations: emit event so the bridge joins all member sockets to the room
  if (type === "group") {
    eventBus.emit("conversation.created", {
      conversationId: conversation.id,
      type: "group",
      memberIds: allMemberIds,
      timestamp: new Date().toISOString(),
    });
  }

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
