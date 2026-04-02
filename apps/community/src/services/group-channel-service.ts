import "server-only";
import { z } from "zod/v4";
import { ApiError } from "@/lib/api-error";
import { eventBus } from "@/services/event-bus";
import { getGroupMember } from "@/db/queries/groups";
import {
  createGroupChannel,
  createChannelConversation,
  addMembersToConversation,
  listGroupChannels,
  getGroupChannel,
  deleteGroupChannel,
  softDeleteChannelConversation,
  countGroupChannels,
  listActiveGroupMemberIds,
  type GroupChannelItem,
  type CommunityGroupChannel,
} from "@/db/queries/group-channels";

export type { GroupChannelItem, CommunityGroupChannel };

const MAX_CHANNELS_PER_GROUP = 10;

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

/**
 * Create the default "General" channel for a group + its backing conversation.
 * All active members are added to the conversation.
 * Idempotent — unique index prevents duplicate defaults.
 */
export async function createDefaultChannel(
  groupId: string,
  creatorId: string,
): Promise<{ channel: CommunityGroupChannel; conversationId: string }> {
  const channel = await createGroupChannel({
    groupId,
    name: "General",
    isDefault: true,
    createdBy: creatorId,
  });

  const conversation = await createChannelConversation(channel.id);

  // Add all current active members (may be just the creator at group creation time)
  const memberIds = await listActiveGroupMemberIds(groupId);
  await addMembersToConversation(conversation.id, memberIds);

  return { channel, conversationId: conversation.id };
}

/**
 * Create a new custom channel for a group (leader/creator only, max 10 channels).
 */
export async function createChannel(
  leaderId: string,
  groupId: string,
  input: { name: string; description?: string },
): Promise<GroupChannelItem> {
  // Verify caller is creator or leader
  const callerMembership = await getGroupMember(groupId, leaderId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can create channels",
    });
  }

  // Enforce channel limit
  const channelCount = await countGroupChannels(groupId);
  if (channelCount >= MAX_CHANNELS_PER_GROUP) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: "Groups.channel.maxChannelsReached",
    });
  }

  // Validate input
  const parsed = createChannelSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError({ status: 400, title: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const channel = await createGroupChannel({
    groupId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    isDefault: false,
    createdBy: leaderId,
  });

  const conversation = await createChannelConversation(channel.id);

  // Add all active members to the new channel
  const memberIds = await listActiveGroupMemberIds(groupId);
  await addMembersToConversation(conversation.id, memberIds);

  eventBus.emit("group.channel_created", {
    groupId,
    channelId: channel.id,
    createdBy: leaderId,
    timestamp: new Date().toISOString(),
  });

  // Return a GroupChannelItem (join with conversationId)
  const channels = await listGroupChannels(groupId);
  const created = channels.find((c) => c.id === channel.id);
  if (!created) throw new Error("Failed to retrieve created channel");
  return created;
}

/**
 * Delete a non-default channel (leader/creator only).
 * Soft-deletes the conversation (preserves history), hard-deletes the channel.
 */
export async function deleteChannel(
  leaderId: string,
  groupId: string,
  channelId: string,
): Promise<void> {
  // Verify caller is creator or leader
  const callerMembership = await getGroupMember(groupId, leaderId);
  if (
    !callerMembership ||
    (callerMembership.role !== "creator" && callerMembership.role !== "leader")
  ) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can delete channels",
    });
  }

  // Fetch the channel
  const channel = await getGroupChannel(channelId);
  if (!channel) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Channel not found" });
  }

  // Verify the channel belongs to this group
  if (channel.groupId !== groupId) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Channel not found" });
  }

  // Cannot delete the default channel
  if (channel.isDefault) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Cannot delete the General channel",
    });
  }

  // Find the conversation for this channel
  const channels = await listGroupChannels(groupId);
  const channelItem = channels.find((c) => c.id === channelId);
  if (channelItem) {
    await softDeleteChannelConversation(channelItem.conversationId);
  }

  // Hard-delete the channel (FK SET NULL nulls chatConversations.channelId)
  await deleteGroupChannel(channelId);

  eventBus.emit("group.channel_deleted", {
    groupId,
    channelId,
    deletedBy: leaderId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * List all channels for a group.
 */
export async function listChannelsForGroup(groupId: string): Promise<GroupChannelItem[]> {
  return listGroupChannels(groupId);
}
