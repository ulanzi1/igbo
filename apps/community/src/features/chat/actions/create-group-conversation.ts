"use server";

import { requireAuthenticatedSession } from "@/services/permissions";
import { createConversation, checkBlocksAmongMembers } from "@/db/queries/chat-conversations";
import { MAX_GROUP_MEMBERS } from "@igbo/config/chat";
import { eventBus } from "@/services/event-bus";

export async function createGroupConversation(
  memberIds: string[],
): Promise<{ conversationId: string } | { error: string }> {
  try {
    const { userId } = await requireAuthenticatedSession();

    const uniqueOtherIds = Array.from(new Set(memberIds.filter((id) => id !== userId)));
    if (uniqueOtherIds.length < 2) {
      return { error: "Group conversations require at least 2 other members" };
    }
    if (uniqueOtherIds.length > MAX_GROUP_MEMBERS - 1) {
      return { error: `Group conversations cannot exceed ${MAX_GROUP_MEMBERS} members` };
    }

    const allMemberIds = [userId, ...uniqueOtherIds];

    const hasBlockConflict = await checkBlocksAmongMembers(allMemberIds);
    if (hasBlockConflict) {
      return { error: "Cannot create conversation with this user" };
    }

    const conversation = await createConversation("group", allMemberIds);

    eventBus.emit("conversation.created", {
      conversationId: conversation.id,
      type: "group",
      memberIds: allMemberIds,
      timestamp: new Date().toISOString(),
    });

    return { conversationId: conversation.id };
  } catch {
    return { error: "Failed to create group conversation" };
  }
}
