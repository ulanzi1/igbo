"use server";

import { requireAuthenticatedSession } from "@/services/permissions";
import {
  createConversation,
  findExistingDirectConversation,
  getConversationById,
} from "@/db/queries/chat-conversations";
import { isBlocked } from "@/db/queries/block-mute";

export async function createOrFindDirectConversation(
  otherUserId: string,
): Promise<{ conversationId: string } | { error: string }> {
  try {
    const { userId } = await requireAuthenticatedSession();

    if (otherUserId === userId) {
      return { error: "Cannot create a direct conversation with yourself" };
    }

    // Return existing conversation if one exists (idempotent)
    const existingId = await findExistingDirectConversation(userId, otherUserId);
    if (existingId) {
      const existing = await getConversationById(existingId);
      if (existing) {
        return { conversationId: existing.id };
      }
    }

    // Block check: bidirectional
    const blockedByThem = await isBlocked(otherUserId, userId);
    const blockedByMe = await isBlocked(userId, otherUserId);
    if (blockedByThem || blockedByMe) {
      return { error: "Cannot create conversation with this user" };
    }

    const conversation = await createConversation("direct", [userId, otherUserId]);
    return { conversationId: conversation.id };
  } catch {
    return { error: "Failed to create conversation" };
  }
}
