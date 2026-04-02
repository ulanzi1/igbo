// No "server-only" — consistent with other query files
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../index";
import {
  communityGroupChannels,
  type CommunityGroupChannel,
  type NewCommunityGroupChannel,
} from "../schema/community-group-channels";
import {
  chatConversations,
  chatConversationMembers,
  type ChatConversation,
} from "../schema/chat-conversations";
import { communityGroupMembers } from "../schema/community-groups";
import { chatMessageAttachments } from "../schema/chat-message-attachments";
import { chatMessages } from "../schema/chat-messages";
import { authUsers } from "../schema/auth-users";

export type { CommunityGroupChannel, NewCommunityGroupChannel };

export interface GroupChannelItem {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  conversationId: string;
}

export interface GroupFileItem {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedAt: Date;
  uploaderName: string | null;
  messageId: string;
  conversationId: string;
}

/**
 * Insert a new group channel row. Optionally accepts a transaction.
 */
export async function createGroupChannel(
  input: {
    groupId: string;
    name: string;
    description?: string | null;
    isDefault: boolean;
    createdBy: string;
  },
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<CommunityGroupChannel> {
  const executor = tx ?? db;
  const [channel] = await executor
    .insert(communityGroupChannels)
    .values({
      groupId: input.groupId,
      name: input.name,
      description: input.description ?? null,
      isDefault: input.isDefault,
      createdBy: input.createdBy,
    })
    .returning();
  if (!channel) throw new Error("Failed to create group channel");
  return channel;
}

/**
 * Insert a channel-type conversation linked to the given channelId.
 */
export async function createChannelConversation(
  channelId: string,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<ChatConversation> {
  const executor = tx ?? db;
  const [conversation] = await executor
    .insert(chatConversations)
    .values({ type: "channel", channelId })
    .returning();
  if (!conversation) throw new Error("Failed to create channel conversation");
  return conversation;
}

/**
 * Bulk-insert members into a conversation. Idempotent via ON CONFLICT DO NOTHING.
 */
export async function addMembersToConversation(
  conversationId: string,
  userIds: string[],
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  if (userIds.length === 0) return;
  const executor = tx ?? db;
  await executor
    .insert(chatConversationMembers)
    .values(userIds.map((userId) => ({ conversationId, userId, role: "member" as const })))
    .onConflictDoNothing();
}

/**
 * List all channels for a group with their backing conversationId.
 * Default channel first, then by createdAt ascending.
 */
export async function listGroupChannels(groupId: string): Promise<GroupChannelItem[]> {
  const rows = await db
    .select({
      id: communityGroupChannels.id,
      groupId: communityGroupChannels.groupId,
      name: communityGroupChannels.name,
      description: communityGroupChannels.description,
      isDefault: communityGroupChannels.isDefault,
      createdBy: communityGroupChannels.createdBy,
      createdAt: communityGroupChannels.createdAt,
      conversationId: chatConversations.id,
    })
    .from(communityGroupChannels)
    .innerJoin(
      chatConversations,
      and(
        eq(chatConversations.channelId, communityGroupChannels.id),
        sql`${chatConversations.deletedAt} IS NULL`,
      ),
    )
    .where(eq(communityGroupChannels.groupId, groupId))
    .orderBy(desc(communityGroupChannels.isDefault), communityGroupChannels.createdAt);

  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    name: r.name,
    description: r.description,
    isDefault: r.isDefault,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    conversationId: r.conversationId,
  }));
}

/**
 * Fetch a single channel by ID.
 */
export async function getGroupChannel(channelId: string): Promise<CommunityGroupChannel | null> {
  const [channel] = await db
    .select()
    .from(communityGroupChannels)
    .where(eq(communityGroupChannels.id, channelId))
    .limit(1);
  return channel ?? null;
}

/**
 * Hard-delete a channel row. FK ON DELETE SET NULL nulls chatConversations.channelId.
 */
export async function deleteGroupChannel(channelId: string): Promise<void> {
  await db.delete(communityGroupChannels).where(eq(communityGroupChannels.id, channelId));
}

/**
 * Soft-delete the channel's conversation (marks deleted_at — prevents new messages).
 */
export async function softDeleteChannelConversation(conversationId: string): Promise<void> {
  await db
    .update(chatConversations)
    .set({ deletedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));
}

/**
 * Get the default channel's backing conversationId for a group.
 * Returns null if no default channel exists (e.g. group created before Story 5.3).
 */
export async function getDefaultChannelConversationId(groupId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .innerJoin(communityGroupChannels, eq(chatConversations.channelId, communityGroupChannels.id))
    .where(
      and(
        eq(communityGroupChannels.groupId, groupId),
        eq(communityGroupChannels.isDefault, true),
        sql`${chatConversations.deletedAt} IS NULL`,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Get all active (non-soft-deleted) channel conversation IDs for a group.
 * Used to enroll a new member in every existing channel when they join.
 */
export async function listAllChannelConversationIds(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .innerJoin(communityGroupChannels, eq(chatConversations.channelId, communityGroupChannels.id))
    .where(
      and(eq(communityGroupChannels.groupId, groupId), sql`${chatConversations.deletedAt} IS NULL`),
    );
  return rows.map((r) => r.id);
}

/**
 * Count total channels for a group.
 */
export async function countGroupChannels(groupId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(communityGroupChannels)
    .where(eq(communityGroupChannels.groupId, groupId));
  return row?.count ?? 0;
}

/**
 * Get all active member userIds for a group.
 */
export async function listActiveGroupMemberIds(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: communityGroupMembers.userId })
    .from(communityGroupMembers)
    .where(
      and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.status, "active")),
    );
  return rows.map((r) => r.userId);
}

/**
 * List files shared in group channels (via chat message attachments).
 * Cursor is a numeric offset.
 */
export async function listGroupFiles(
  groupId: string,
  cursor?: number,
  limit = 50,
): Promise<GroupFileItem[]> {
  const offset = cursor ?? 0;
  const rows = await db
    .select({
      id: chatMessageAttachments.id,
      fileName: chatMessageAttachments.fileName,
      fileUrl: chatMessageAttachments.fileUrl,
      fileType: chatMessageAttachments.fileType,
      fileSize: chatMessageAttachments.fileSize,
      uploadedAt: chatMessageAttachments.createdAt,
      uploaderName: authUsers.name,
      messageId: chatMessageAttachments.messageId,
      conversationId: chatMessages.conversationId,
    })
    .from(chatMessageAttachments)
    .innerJoin(chatMessages, eq(chatMessageAttachments.messageId, chatMessages.id))
    .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
    .innerJoin(communityGroupChannels, eq(chatConversations.channelId, communityGroupChannels.id))
    .leftJoin(authUsers, eq(chatMessages.senderId, authUsers.id))
    .where(eq(communityGroupChannels.groupId, groupId))
    .orderBy(desc(chatMessageAttachments.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileUrl: r.fileUrl,
    fileType: r.fileType ?? null,
    fileSize: r.fileSize ?? null,
    uploadedAt: r.uploadedAt,
    uploaderName: r.uploaderName ?? null,
    messageId: r.messageId,
    conversationId: r.conversationId,
  }));
}
