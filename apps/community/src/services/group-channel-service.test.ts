// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api-error";

vi.mock("@/db/queries/groups", () => ({
  getGroupMember: vi.fn(),
}));

vi.mock("@/db/queries/group-channels", () => ({
  createGroupChannel: vi.fn(),
  createChannelConversation: vi.fn(),
  addMembersToConversation: vi.fn(),
  listGroupChannels: vi.fn(),
  getGroupChannel: vi.fn(),
  deleteGroupChannel: vi.fn(),
  softDeleteChannelConversation: vi.fn(),
  countGroupChannels: vi.fn(),
  listActiveGroupMemberIds: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

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
} from "@/db/queries/group-channels";

const mockGetGroupMember = getGroupMember as ReturnType<typeof vi.fn>;
const mockCreateGroupChannel = createGroupChannel as ReturnType<typeof vi.fn>;
const mockCreateChannelConversation = createChannelConversation as ReturnType<typeof vi.fn>;
const mockAddMembersToConversation = addMembersToConversation as ReturnType<typeof vi.fn>;
const mockListGroupChannels = listGroupChannels as ReturnType<typeof vi.fn>;
const mockGetGroupChannel = getGroupChannel as ReturnType<typeof vi.fn>;
const mockDeleteGroupChannel = deleteGroupChannel as ReturnType<typeof vi.fn>;
const mockSoftDeleteChannelConversation = softDeleteChannelConversation as ReturnType<typeof vi.fn>;
const mockCountGroupChannels = countGroupChannels as ReturnType<typeof vi.fn>;
const mockListActiveGroupMemberIds = listActiveGroupMemberIds as ReturnType<typeof vi.fn>;

const CHANNEL = {
  id: "chan-1",
  groupId: "group-1",
  name: "General",
  description: null,
  isDefault: true,
  createdBy: "user-1",
  createdAt: new Date(),
};

const CONVERSATION = {
  id: "conv-1",
  type: "channel" as const,
  channelId: "chan-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("createDefaultChannel", () => {
  beforeEach(() => {
    mockCreateGroupChannel.mockReset();
    mockCreateChannelConversation.mockReset();
    mockAddMembersToConversation.mockReset();
    mockListActiveGroupMemberIds.mockReset();
  });

  it("creates channel + conversation and adds members", async () => {
    mockCreateGroupChannel.mockResolvedValue(CHANNEL);
    mockCreateChannelConversation.mockResolvedValue(CONVERSATION);
    mockListActiveGroupMemberIds.mockResolvedValue(["user-1", "user-2"]);
    mockAddMembersToConversation.mockResolvedValue(undefined);

    const { createDefaultChannel } = await import("@/services/group-channel-service");
    const result = await createDefaultChannel("group-1", "user-1");

    expect(result.channel).toEqual(CHANNEL);
    expect(result.conversationId).toBe("conv-1");
    expect(mockAddMembersToConversation).toHaveBeenCalledWith("conv-1", ["user-1", "user-2"]);
  });

  it("works with empty member list (at group creation time)", async () => {
    mockCreateGroupChannel.mockResolvedValue(CHANNEL);
    mockCreateChannelConversation.mockResolvedValue(CONVERSATION);
    mockListActiveGroupMemberIds.mockResolvedValue([]);
    mockAddMembersToConversation.mockResolvedValue(undefined);

    const { createDefaultChannel } = await import("@/services/group-channel-service");
    const result = await createDefaultChannel("group-1", "user-1");

    expect(result.conversationId).toBe("conv-1");
    expect(mockAddMembersToConversation).toHaveBeenCalledWith("conv-1", []);
  });
});

describe("createChannel", () => {
  beforeEach(() => {
    mockGetGroupMember.mockReset();
    mockCountGroupChannels.mockReset();
    mockCreateGroupChannel.mockReset();
    mockCreateChannelConversation.mockReset();
    mockListActiveGroupMemberIds.mockReset();
    mockAddMembersToConversation.mockReset();
    mockListGroupChannels.mockReset();
  });

  it("creates channel for leader", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockCountGroupChannels.mockResolvedValue(1);
    mockCreateGroupChannel.mockResolvedValue({ ...CHANNEL, isDefault: false, name: "Events" });
    mockCreateChannelConversation.mockResolvedValue(CONVERSATION);
    mockListActiveGroupMemberIds.mockResolvedValue(["user-1"]);
    mockAddMembersToConversation.mockResolvedValue(undefined);
    mockListGroupChannels.mockResolvedValue([
      {
        id: "chan-1",
        groupId: "group-1",
        name: "Events",
        conversationId: "conv-1",
        isDefault: false,
        createdBy: "user-1",
        createdAt: new Date(),
        description: null,
      },
    ]);

    const { createChannel } = await import("@/services/group-channel-service");
    const result = await createChannel("user-1", "group-1", { name: "Events" });

    expect(result.name).toBe("Events");
  });

  it("throws 403 for non-leader", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const { createChannel } = await import("@/services/group-channel-service");
    await expect(createChannel("user-1", "group-1", { name: "Events" })).rejects.toThrow(ApiError);
  });

  it("throws 422 when at max channels", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });
    mockCountGroupChannels.mockResolvedValue(10);

    const { createChannel } = await import("@/services/group-channel-service");
    await expect(createChannel("user-1", "group-1", { name: "Eleventh" })).rejects.toThrow(
      ApiError,
    );
  });

  it("throws 403 when user is not a member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const { createChannel } = await import("@/services/group-channel-service");
    await expect(createChannel("user-1", "group-1", { name: "Test" })).rejects.toThrow(ApiError);
  });
});

describe("deleteChannel", () => {
  beforeEach(() => {
    mockGetGroupMember.mockReset();
    mockGetGroupChannel.mockReset();
    mockListGroupChannels.mockReset();
    mockSoftDeleteChannelConversation.mockReset();
    mockDeleteGroupChannel.mockReset();
  });

  it("deletes non-default channel for leader", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockGetGroupChannel.mockResolvedValue({
      id: "chan-2",
      groupId: "group-1",
      isDefault: false,
      name: "Events",
    });
    mockListGroupChannels.mockResolvedValue([
      { id: "chan-2", conversationId: "conv-2", isDefault: false },
    ]);
    mockSoftDeleteChannelConversation.mockResolvedValue(undefined);
    mockDeleteGroupChannel.mockResolvedValue(undefined);

    const { deleteChannel } = await import("@/services/group-channel-service");
    await deleteChannel("user-1", "group-1", "chan-2");

    expect(mockSoftDeleteChannelConversation).toHaveBeenCalledWith("conv-2");
    expect(mockDeleteGroupChannel).toHaveBeenCalledWith("chan-2");
  });

  it("throws 403 for member trying to delete", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const { deleteChannel } = await import("@/services/group-channel-service");
    await expect(deleteChannel("user-1", "group-1", "chan-2")).rejects.toThrow(ApiError);
  });

  it("throws 404 when channel not found", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockGetGroupChannel.mockResolvedValue(null);

    const { deleteChannel } = await import("@/services/group-channel-service");
    await expect(deleteChannel("user-1", "group-1", "chan-2")).rejects.toThrow(ApiError);
  });

  it("throws 403 when trying to delete the General channel", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });
    mockGetGroupChannel.mockResolvedValue({
      id: "chan-1",
      groupId: "group-1",
      isDefault: true,
      name: "General",
    });

    const { deleteChannel } = await import("@/services/group-channel-service");
    await expect(deleteChannel("user-1", "group-1", "chan-1")).rejects.toThrow(ApiError);
  });

  it("throws 404 when channel belongs to different group", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockGetGroupChannel.mockResolvedValue({
      id: "chan-2",
      groupId: "other-group",
      isDefault: false,
    });

    const { deleteChannel } = await import("@/services/group-channel-service");
    await expect(deleteChannel("user-1", "group-1", "chan-2")).rejects.toThrow(ApiError);
  });
});

describe("listChannelsForGroup", () => {
  beforeEach(() => {
    mockListGroupChannels.mockReset();
  });

  it("delegates to listGroupChannels", async () => {
    const channels = [{ id: "chan-1", name: "General" }];
    mockListGroupChannels.mockResolvedValue(channels);

    const { listChannelsForGroup } = await import("@/services/group-channel-service");
    const result = await listChannelsForGroup("group-1");
    expect(result).toEqual(channels);
  });
});
