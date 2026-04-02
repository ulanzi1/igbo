import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import {
  isConversationMember,
  getConversationById,
  getConversationMembers,
  addConversationMember,
  removeConversationMember,
  getConversationMemberCount,
  checkGroupBlockConflict,
  softDeleteConversation,
} from "@/db/queries/chat-conversations";
import { messageService } from "@/services/message-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { MAX_GROUP_MEMBERS } from "@igbo/config/chat";
import { eventBus } from "@/services/event-bus";

// URL parsing: "members" is the last segment — conversationId is second-to-last
function extractConversationId(url: string): string | null {
  return new URL(url).pathname.split("/").at(-2) ?? null;
}

// ── POST /api/v1/conversations/[conversationId]/members ───────────────────────

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const conversationId = extractConversationId(request.url);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Conversation not found" });
  }

  if (conversation.type !== "group") {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Can only add members to group conversations",
    });
  }

  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const { userId: newUserId } = body as { userId?: unknown };
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof newUserId !== "string" || !uuidRegex.test(newUserId)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "userId must be a valid UUID",
    });
  }

  // Check if user exists (avoid FK violation → 500 on nonexistent user)
  const { getProfileByUserId } = await import("@/db/queries/community-profiles");
  const newMemberProfile = await getProfileByUserId(newUserId);
  if (!newMemberProfile) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
  }

  // Check if already a member
  const alreadyMember = await isConversationMember(conversationId, newUserId);
  if (alreadyMember) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "User is already a member" });
  }

  // Check member count limit
  const memberCount = await getConversationMemberCount(conversationId);
  if (memberCount >= MAX_GROUP_MEMBERS) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Group has reached the maximum of ${MAX_GROUP_MEMBERS} members`,
    });
  }

  // Block check: new user vs ALL existing members (both directions)
  const existingMembers = await getConversationMembers(conversationId);
  const existingMemberIds = existingMembers.map((m) => m.userId);
  const hasBlockConflict = await checkGroupBlockConflict(newUserId, existingMemberIds);
  if (hasBlockConflict) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Cannot add this user due to a block relationship",
    });
  }

  // Add member (sets joined_at = last_read_at = NOW() for AC4 message visibility)
  await addConversationMember(conversationId, newUserId);

  // Send system message "[Name] was added to the conversation"
  // newMemberProfile already loaded above for existence check
  const newMemberName = newMemberProfile.displayName ?? "A member";
  await messageService.sendSystemMessage(
    conversationId,
    userId, // actingUserId = the adder (NOT a fake system UUID)
    `${newMemberName} was added to the conversation`,
  );

  // Emit EventBus event so bridge joins new member's socket to the room
  eventBus.emit("conversation.member_added", {
    conversationId,
    newUserId,
    addedByUserId: userId,
    timestamp: new Date().toISOString(),
  });

  return successResponse({ member: { userId: newUserId, joinedAt: new Date().toISOString() } });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `conversation-member-manage:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.CONVERSATION_MEMBER_MANAGE,
  },
});

// ── DELETE /api/v1/conversations/[conversationId]/members ─────────────────────

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const conversationId = extractConversationId(request.url);
  if (!conversationId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing conversationId" });
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Conversation not found" });
  }

  if (conversation.type !== "group") {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Cannot leave a direct conversation",
    });
  }

  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this conversation",
    });
  }

  // Send system message before removing (so sender_id is still valid)
  const { getProfileByUserId } = await import("@/db/queries/community-profiles");
  const leaverProfile = await getProfileByUserId(userId);
  const leaverName = leaverProfile?.displayName ?? "A member";
  await messageService.sendSystemMessage(
    conversationId,
    userId, // actingUserId = the leaver
    `${leaverName} left the conversation`,
  );

  // Remove member
  await removeConversationMember(conversationId, userId);

  // Emit EventBus event so bridge removes leaver's socket from room
  eventBus.emit("conversation.member_left", {
    conversationId,
    userId,
    timestamp: new Date().toISOString(),
  });

  // Soft-delete conversation if only 0 or 1 member remains
  const remainingCount = await getConversationMemberCount(conversationId);
  if (remainingCount <= 1) {
    await softDeleteConversation(conversationId);
  }

  return successResponse({ left: true });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `conversation-member-manage:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.CONVERSATION_MEMBER_MANAGE,
  },
});
