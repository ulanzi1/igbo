// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/groups", () => ({
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  getGroupById: vi.fn(),
  getGroupMember: vi.fn(),
  addGroupMember: vi.fn(),
  listGroups: vi.fn(),
  updateGroupMemberRole: vi.fn(),
  findEarliestActiveLeader: vi.fn(),
  findEarliestActiveMember: vi.fn(),
  softDeleteGroup: vi.fn(),
  getUserPlatformRole: vi.fn(),
}));
vi.mock("@/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn(),
}));
vi.mock("@/db/queries/group-channels", () => ({
  listAllChannelConversationIds: vi.fn().mockResolvedValue([]),
  softDeleteChannelConversation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/permissions", () => ({
  canCreateGroup: vi.fn(),
}));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("@/services/group-channel-service", () => ({
  createDefaultChannel: vi.fn().mockResolvedValue({ channel: {}, conversationId: "conv-1" }),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status, detail }: { title: string; status: number; detail?: string }) {
      super(detail ?? title);
      this.status = status;
    }
  },
}));

import {
  createGroupForUser,
  updateGroupSettings,
  getGroupDetails,
  assignGroupLeader,
  transferGroupOwnership,
  archiveGroup,
} from "./group-service";
import {
  createGroup,
  updateGroup,
  getGroupById,
  getGroupMember,
  updateGroupMemberRole,
  findEarliestActiveLeader,
  findEarliestActiveMember,
  softDeleteGroup,
  getUserPlatformRole,
} from "@/db/queries/groups";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import {
  listAllChannelConversationIds,
  softDeleteChannelConversation,
} from "@/db/queries/group-channels";
import { canCreateGroup } from "@/services/permissions";
import { eventBus } from "@/services/event-bus";

const mockCreateGroup = vi.mocked(createGroup);
const mockUpdateGroup = vi.mocked(updateGroup);
const mockGetGroupById = vi.mocked(getGroupById);
const mockGetGroupMember = vi.mocked(getGroupMember);
const mockUpdateGroupMemberRole = vi.mocked(updateGroupMemberRole);
const mockFindEarliestActiveLeader = vi.mocked(findEarliestActiveLeader);
const mockFindEarliestActiveMember = vi.mocked(findEarliestActiveMember);
const mockSoftDeleteGroup = vi.mocked(softDeleteGroup);
const mockListAllChannelConversationIds = vi.mocked(listAllChannelConversationIds);
const mockSoftDeleteChannelConversation = vi.mocked(softDeleteChannelConversation);
const mockGetUserMembershipTier = vi.mocked(getUserMembershipTier);
const mockGetUserPlatformRole = vi.mocked(getUserPlatformRole);
const mockCanCreateGroup = vi.mocked(canCreateGroup);
const mockEmit = vi.mocked(eventBus.emit);

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";

const mockGroup = {
  id: GROUP_ID,
  name: "Test Group",
  description: null,
  bannerUrl: null,
  visibility: "public" as const,
  joinType: "open" as const,
  postingPermission: "all_members" as const,
  commentingPermission: "open" as const,
  memberLimit: null,
  creatorId: USER_ID,
  memberCount: 1,
  deletedAt: null,
  createdAt: new Date("2026-03-01"),
  updatedAt: new Date("2026-03-01"),
};

const validInput = {
  name: "Test Group",
  description: null,
  bannerUrl: null,
  visibility: "public" as const,
  joinType: "open" as const,
  postingPermission: "all_members" as const,
  commentingPermission: "open" as const,
  memberLimit: null,
};

const LEADER_ID = "00000000-0000-4000-8000-000000000003";
const TARGET_ID = "00000000-0000-4000-8000-000000000004";

beforeEach(() => {
  mockCreateGroup.mockReset();
  mockUpdateGroup.mockReset();
  mockGetGroupById.mockReset();
  mockGetGroupMember.mockReset();
  mockUpdateGroupMemberRole.mockReset();
  mockFindEarliestActiveLeader.mockReset();
  mockFindEarliestActiveMember.mockReset();
  mockSoftDeleteGroup.mockReset();
  mockListAllChannelConversationIds.mockReset();
  mockSoftDeleteChannelConversation.mockReset();
  mockGetUserMembershipTier.mockReset();
  mockGetUserPlatformRole.mockReset();
  mockCanCreateGroup.mockReset();
  mockEmit.mockReset();

  mockGetGroupById.mockResolvedValue(mockGroup);
  mockListAllChannelConversationIds.mockResolvedValue([]);

  mockCanCreateGroup.mockResolvedValue({ allowed: true });
  mockCreateGroup.mockResolvedValue(mockGroup);
  mockGetGroupById.mockResolvedValue(mockGroup);
});

describe("createGroupForUser", () => {
  it("calls createGroup and emits group.created on success", async () => {
    const result = await createGroupForUser(USER_ID, validInput);

    expect(mockCanCreateGroup).toHaveBeenCalledWith(USER_ID);
    expect(mockCreateGroup).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Group", creatorId: USER_ID }),
    );
    expect(mockEmit).toHaveBeenCalledWith(
      "group.created",
      expect.objectContaining({ groupId: GROUP_ID, creatorId: USER_ID }),
    );
    expect(result.id).toBe(GROUP_ID);
  });

  it("throws 403 ApiError when permission denied", async () => {
    mockCanCreateGroup.mockResolvedValue({
      allowed: false,
      reason: "TOP_TIER required",
      tierRequired: "TOP_TIER",
    });

    await expect(createGroupForUser(USER_ID, validInput)).rejects.toMatchObject({ status: 403 });
    expect(mockCreateGroup).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("does not emit event when db throws", async () => {
    mockCreateGroup.mockRejectedValue(new Error("DB error"));

    await expect(createGroupForUser(USER_ID, validInput)).rejects.toThrow("DB error");
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("updateGroupSettings", () => {
  it("updates group and emits group.updated when caller is creator", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });
    mockUpdateGroup.mockResolvedValue({ ...mockGroup, name: "Updated Name" });

    const result = await updateGroupSettings(USER_ID, GROUP_ID, { name: "Updated Name" });

    expect(mockGetGroupById).toHaveBeenCalledWith(GROUP_ID);
    expect(mockGetGroupMember).toHaveBeenCalledWith(GROUP_ID, USER_ID);
    expect(mockUpdateGroup).toHaveBeenCalledWith(GROUP_ID, { name: "Updated Name" });
    expect(mockEmit).toHaveBeenCalledWith(
      "group.updated",
      expect.objectContaining({ groupId: GROUP_ID, updatedBy: USER_ID }),
    );
    expect(result.name).toBe("Updated Name");
  });

  it("updates group and emits group.updated when caller is leader", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockUpdateGroup.mockResolvedValue(mockGroup);

    await updateGroupSettings(USER_ID, GROUP_ID, {});

    expect(mockUpdateGroup).toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith("group.updated", expect.any(Object));
  });

  it("throws 403 when caller is a regular member", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    await expect(updateGroupSettings(USER_ID, GROUP_ID, {})).rejects.toMatchObject({ status: 403 });
    expect(mockUpdateGroup).not.toHaveBeenCalled();
  });

  it("throws 403 when caller is not a member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    await expect(updateGroupSettings(USER_ID, GROUP_ID, {})).rejects.toMatchObject({ status: 403 });
    expect(mockUpdateGroup).not.toHaveBeenCalled();
  });

  it("throws 404 when group not found", async () => {
    mockGetGroupById.mockResolvedValue(null);

    await expect(updateGroupSettings(USER_ID, GROUP_ID, {})).rejects.toMatchObject({ status: 404 });
  });
});

describe("getGroupDetails", () => {
  it("delegates to getGroupById and returns the group", async () => {
    const result = await getGroupDetails(GROUP_ID);

    expect(mockGetGroupById).toHaveBeenCalledWith(GROUP_ID);
    expect(result).toEqual(mockGroup);
  });

  it("returns null for deleted/missing group", async () => {
    mockGetGroupById.mockResolvedValue(null);

    const result = await getGroupDetails(GROUP_ID);
    expect(result).toBeNull();
  });
});

describe("assignGroupLeader", () => {
  beforeEach(() => {
    mockGetGroupMember.mockReset();
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    mockUpdateGroupMemberRole.mockResolvedValue(undefined);
  });

  it("assigns leader role when creator promotes a PROFESSIONAL member", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" }) // actor
      .mockResolvedValueOnce({ role: "member", status: "active" }); // target

    await assignGroupLeader(USER_ID, GROUP_ID, TARGET_ID);

    expect(mockUpdateGroupMemberRole).toHaveBeenCalledWith(GROUP_ID, TARGET_ID, "leader");
    expect(mockEmit).toHaveBeenCalledWith(
      "group.leader_assigned",
      expect.objectContaining({ groupId: GROUP_ID, userId: TARGET_ID, assignedBy: USER_ID }),
    );
  });

  it("throws 404 when group not found", async () => {
    mockGetGroupById.mockResolvedValue(null);

    await expect(assignGroupLeader(USER_ID, GROUP_ID, TARGET_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 403 when actor is a leader (not creator)", async () => {
    mockGetGroupMember.mockResolvedValueOnce({ role: "leader", status: "active" });

    await expect(assignGroupLeader(LEADER_ID, GROUP_ID, TARGET_ID)).rejects.toMatchObject({
      status: 403,
    });
    expect(mockUpdateGroupMemberRole).not.toHaveBeenCalled();
  });

  it("throws 404 when target is not an active member", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" }) // actor
      .mockResolvedValueOnce(null); // target not found

    await expect(assignGroupLeader(USER_ID, GROUP_ID, TARGET_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 422 when target is already a leader", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "leader", status: "active" });

    await expect(assignGroupLeader(USER_ID, GROUP_ID, TARGET_ID)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("throws 422 when target tier is BASIC", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "active" });
    mockGetUserMembershipTier.mockResolvedValue("BASIC");

    await expect(assignGroupLeader(USER_ID, GROUP_ID, TARGET_ID)).rejects.toMatchObject({
      status: 422,
    });
    expect(mockUpdateGroupMemberRole).not.toHaveBeenCalled();
  });

  it("allows assignment when target tier is TOP_TIER", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "active" });
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");

    await expect(assignGroupLeader(USER_ID, GROUP_ID, TARGET_ID)).resolves.toBeUndefined();
    expect(mockUpdateGroupMemberRole).toHaveBeenCalledWith(GROUP_ID, TARGET_ID, "leader");
  });
});

describe("transferGroupOwnership", () => {
  beforeEach(() => {
    mockUpdateGroupMemberRole.mockResolvedValue(undefined);
    mockFindEarliestActiveLeader.mockReset();
    mockFindEarliestActiveMember.mockReset();
  });

  it("transfers to earliest leader when one exists", async () => {
    mockFindEarliestActiveLeader.mockResolvedValue({
      userId: LEADER_ID,
      joinedAt: new Date("2026-01-01"),
    });

    await transferGroupOwnership(GROUP_ID, USER_ID);

    expect(mockUpdateGroupMemberRole).toHaveBeenCalledWith(GROUP_ID, LEADER_ID, "creator");
    expect(mockUpdateGroupMemberRole).toHaveBeenCalledWith(GROUP_ID, USER_ID, "member");
    expect(mockEmit).toHaveBeenCalledWith(
      "group.ownership_transferred",
      expect.objectContaining({
        groupId: GROUP_ID,
        previousOwnerId: USER_ID,
        newOwnerId: LEADER_ID,
      }),
    );
  });

  it("promotes earliest member when no leaders exist", async () => {
    mockFindEarliestActiveLeader.mockResolvedValue(null);
    mockFindEarliestActiveMember.mockResolvedValue({
      userId: TARGET_ID,
      joinedAt: new Date("2026-01-01"),
    });

    await transferGroupOwnership(GROUP_ID, USER_ID);

    expect(mockUpdateGroupMemberRole).toHaveBeenCalledWith(GROUP_ID, TARGET_ID, "creator");
    expect(mockEmit).toHaveBeenCalledWith(
      "group.ownership_transferred",
      expect.objectContaining({ newOwnerId: TARGET_ID }),
    );
  });

  it("archives group when no active members exist", async () => {
    mockFindEarliestActiveLeader.mockResolvedValue(null);
    mockFindEarliestActiveMember.mockResolvedValue(null);

    await transferGroupOwnership(GROUP_ID, USER_ID);

    expect(mockSoftDeleteGroup).toHaveBeenCalledWith(GROUP_ID);
    expect(mockEmit).toHaveBeenCalledWith(
      "group.archived",
      expect.objectContaining({ groupId: GROUP_ID }),
    );
  });
});

describe("archiveGroup", () => {
  beforeEach(() => {
    mockGetGroupMember.mockReset();
    mockSoftDeleteGroup.mockResolvedValue(undefined);
    mockListAllChannelConversationIds.mockResolvedValue(["conv-1", "conv-2"]);
    mockSoftDeleteChannelConversation.mockResolvedValue(undefined);
  });

  it("archives group and freezes channels when creator calls it", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });

    await archiveGroup(USER_ID, GROUP_ID);

    expect(mockSoftDeleteGroup).toHaveBeenCalledWith(GROUP_ID);
    expect(mockSoftDeleteChannelConversation).toHaveBeenCalledTimes(2);
    expect(mockEmit).toHaveBeenCalledWith(
      "group.archived",
      expect.objectContaining({ groupId: GROUP_ID, archivedBy: USER_ID }),
    );
  });

  it("throws 404 when group not found (for non-system actor)", async () => {
    mockGetGroupById.mockResolvedValue(null);

    await expect(archiveGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when actor is not creator or admin", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockGetUserPlatformRole.mockResolvedValue("MEMBER");

    await expect(archiveGroup("other-user-id", GROUP_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("system actor bypasses permission checks and archives", async () => {
    await archiveGroup("system", GROUP_ID);

    expect(mockSoftDeleteGroup).toHaveBeenCalledWith(GROUP_ID);
    expect(mockEmit).toHaveBeenCalledWith("group.archived", expect.any(Object));
  });
});
