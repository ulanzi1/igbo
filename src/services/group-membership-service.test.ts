// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const mockGetGroupById = vi.fn();
const mockGetGroupMember = vi.fn();
const mockCountActiveGroupsForUser = vi.fn();
const mockInsertGroupMember = vi.fn();
const mockUpdateGroupMemberStatus = vi.fn();
const mockRemoveGroupMember = vi.fn();
const mockListGroupLeaders = vi.fn();

vi.mock("@/db/queries/groups", () => ({
  getGroupById: (...args: unknown[]) => mockGetGroupById(...args),
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
  countActiveGroupsForUser: (...args: unknown[]) => mockCountActiveGroupsForUser(...args),
  insertGroupMember: (...args: unknown[]) => mockInsertGroupMember(...args),
  updateGroupMemberStatus: (...args: unknown[]) => mockUpdateGroupMemberStatus(...args),
  removeGroupMember: (...args: unknown[]) => mockRemoveGroupMember(...args),
  listGroupLeaders: (...args: unknown[]) => mockListGroupLeaders(...args),
}));

const mockGetPlatformSetting = vi.fn();
vi.mock("@/db/queries/platform-settings", () => ({
  getPlatformSetting: (...args: unknown[]) => mockGetPlatformSetting(...args),
}));

const mockEmit = vi.fn();
vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}));

const mockGetDefaultChannelConversationId = vi.fn();
const mockListAllChannelConversationIds = vi.fn();
const mockAddMembersToConversation = vi.fn();
vi.mock("@/db/queries/group-channels", () => ({
  getDefaultChannelConversationId: (...args: unknown[]) =>
    mockGetDefaultChannelConversationId(...args),
  listAllChannelConversationIds: (...args: unknown[]) => mockListAllChannelConversationIds(...args),
  addMembersToConversation: (...args: unknown[]) => mockAddMembersToConversation(...args),
}));

const mockSendSystemMessage = vi.fn();
vi.mock("@/services/message-service", () => ({
  messageService: { sendSystemMessage: (...args: unknown[]) => mockSendSystemMessage(...args) },
}));

const mockDb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: { userId: "user_id", displayName: "display_name" },
}));

import {
  joinOpenGroup,
  requestToJoinGroup,
  approveJoinRequest,
  rejectJoinRequest,
  leaveGroup,
} from "./group-membership-service";

const GROUP_ID = "g-111";
const USER_ID = "u-222";
const LEADER_ID = "u-leader";

const makeGroup = (overrides = {}) => ({
  id: GROUP_ID,
  name: "Test Group",
  visibility: "public",
  joinType: "open",
  memberCount: 5,
  memberLimit: null,
  ...overrides,
});

beforeEach(() => {
  // Use per-mock reset to avoid clearing factory-created vi.fn() instances (project pattern)
  mockGetGroupById.mockReset();
  mockGetGroupMember.mockReset();
  mockCountActiveGroupsForUser.mockReset();
  mockInsertGroupMember.mockReset();
  mockUpdateGroupMemberStatus.mockReset();
  mockRemoveGroupMember.mockReset();
  mockListGroupLeaders.mockReset();
  mockGetPlatformSetting.mockReset();
  mockEmit.mockReset();

  mockGetPlatformSetting.mockResolvedValue(40);
  mockCountActiveGroupsForUser.mockResolvedValue(5);
  mockInsertGroupMember.mockResolvedValue(undefined);
  mockUpdateGroupMemberStatus.mockResolvedValue(undefined);
  mockRemoveGroupMember.mockResolvedValue(undefined);
  mockGetDefaultChannelConversationId.mockReset();
  mockGetDefaultChannelConversationId.mockResolvedValue(null); // no system message by default
  mockListAllChannelConversationIds.mockReset();
  mockListAllChannelConversationIds.mockResolvedValue([]); // no channel convs by default
  mockAddMembersToConversation.mockReset();
  mockAddMembersToConversation.mockResolvedValue(undefined);
  mockSendSystemMessage.mockReset();
  mockSendSystemMessage.mockResolvedValue(undefined);
  mockDb.select.mockReset();
});

// ─── joinOpenGroup ──────────────────────────────────────────────────────────

describe("joinOpenGroup", () => {
  it("joins an open group successfully", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue(null);

    const result = await joinOpenGroup(USER_ID, GROUP_ID);

    expect(result).toEqual({ role: "member", status: "active" });
    expect(mockInsertGroupMember).toHaveBeenCalledWith(GROUP_ID, USER_ID, "member", "active");
    expect(mockEmit).toHaveBeenCalledWith(
      "group.member_joined",
      expect.objectContaining({ groupId: GROUP_ID, userId: USER_ID }),
    );
  });

  it("returns no-op when already an active member", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const result = await joinOpenGroup(USER_ID, GROUP_ID);

    expect(result).toEqual({ role: "member", status: "active" });
    expect(mockInsertGroupMember).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("throws 404 when group not found", async () => {
    mockGetGroupById.mockResolvedValue(null);

    await expect(joinOpenGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 422 when group requires approval", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ joinType: "approval" }));

    await expect(joinOpenGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 422 });
  });

  it("throws 404 when group is hidden (before joinType check — no info leakage)", async () => {
    // A hidden group with approval joinType must return 404, not 422
    mockGetGroupById.mockResolvedValue(makeGroup({ visibility: "hidden", joinType: "approval" }));

    await expect(joinOpenGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when group is hidden (open join type)", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ visibility: "hidden" }));

    await expect(joinOpenGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 422 when group is full", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ memberLimit: 5, memberCount: 5 }));
    mockGetGroupMember.mockResolvedValue(null);

    await expect(joinOpenGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 422 });
  });

  it("throws 422 when membership limit reached", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue(null);
    mockGetPlatformSetting.mockResolvedValue(5);
    mockCountActiveGroupsForUser.mockResolvedValue(5);

    await expect(joinOpenGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 422 });
  });
});

// ─── requestToJoinGroup ─────────────────────────────────────────────────────

describe("requestToJoinGroup", () => {
  it("creates a pending join request", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ joinType: "approval", visibility: "private" }));
    mockGetGroupMember.mockResolvedValue(null);

    const result = await requestToJoinGroup(USER_ID, GROUP_ID);

    expect(result).toEqual({ status: "pending" });
    expect(mockInsertGroupMember).toHaveBeenCalledWith(GROUP_ID, USER_ID, "member", "pending");
    expect(mockEmit).toHaveBeenCalledWith(
      "group.join_requested",
      expect.objectContaining({ groupId: GROUP_ID, userId: USER_ID }),
    );
  });

  it("returns idempotent result when already pending", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ joinType: "approval" }));
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "pending" });

    const result = await requestToJoinGroup(USER_ID, GROUP_ID);

    expect(result).toEqual({ status: "pending" });
    expect(mockInsertGroupMember).not.toHaveBeenCalled();
  });

  it("returns idempotent result when already active", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ joinType: "approval" }));
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const result = await requestToJoinGroup(USER_ID, GROUP_ID);

    expect(result).toEqual({ status: "active" });
  });

  it("throws 422 when group is open (not approval)", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ joinType: "open" }));

    await expect(requestToJoinGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 422 });
  });

  it("throws 404 when group is hidden (before joinType check — no info leakage)", async () => {
    // A hidden group with open joinType must return 404, not 422
    mockGetGroupById.mockResolvedValue(makeGroup({ joinType: "open", visibility: "hidden" }));

    await expect(requestToJoinGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when group is hidden (approval join type)", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup({ joinType: "approval", visibility: "hidden" }));

    await expect(requestToJoinGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 422 when group is full", async () => {
    mockGetGroupById.mockResolvedValue(
      makeGroup({ joinType: "approval", memberLimit: 5, memberCount: 5 }),
    );
    mockGetGroupMember.mockResolvedValue(null);

    await expect(requestToJoinGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 422 });
  });
});

// ─── approveJoinRequest ─────────────────────────────────────────────────────

describe("approveJoinRequest", () => {
  it("approves a pending request", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" }) // caller
      .mockResolvedValueOnce({ role: "member", status: "pending" }); // target

    await approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID);

    expect(mockUpdateGroupMemberStatus).toHaveBeenCalledWith(GROUP_ID, USER_ID, "active");
    expect(mockEmit).toHaveBeenCalledWith(
      "group.join_approved",
      expect.objectContaining({ groupId: GROUP_ID, userId: USER_ID, approvedBy: LEADER_ID }),
    );
  });

  it("throws 403 when caller is not a leader", async () => {
    mockGetGroupMember.mockResolvedValueOnce({ role: "member", status: "active" });

    await expect(approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 404 when target is not pending", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "active" }); // not pending

    await expect(approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 422 when membership limit reached at approval time", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "leader", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "pending" });
    mockGetPlatformSetting.mockResolvedValue(5);
    mockCountActiveGroupsForUser.mockResolvedValue(5);

    await expect(approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID)).rejects.toMatchObject({
      status: 422,
    });
  });
});

// ─── rejectJoinRequest ──────────────────────────────────────────────────────

describe("rejectJoinRequest", () => {
  it("rejects a pending request", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "pending" });

    await rejectJoinRequest(LEADER_ID, GROUP_ID, USER_ID);

    expect(mockRemoveGroupMember).toHaveBeenCalledWith(GROUP_ID, USER_ID);
    expect(mockEmit).toHaveBeenCalledWith(
      "group.join_rejected",
      expect.objectContaining({ groupId: GROUP_ID, userId: USER_ID, rejectedBy: LEADER_ID }),
    );
  });

  it("throws 403 when caller is not a leader", async () => {
    mockGetGroupMember.mockResolvedValueOnce({ role: "member", status: "active" });

    await expect(rejectJoinRequest(LEADER_ID, GROUP_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 404 when target is not pending", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce(null);

    await expect(rejectJoinRequest(LEADER_ID, GROUP_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
    });
  });
});

// ─── leaveGroup ─────────────────────────────────────────────────────────────

describe("leaveGroup", () => {
  it("leaves a group successfully", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    await leaveGroup(USER_ID, GROUP_ID);

    expect(mockRemoveGroupMember).toHaveBeenCalledWith(GROUP_ID, USER_ID);
    expect(mockEmit).toHaveBeenCalledWith(
      "group.member_left",
      expect.objectContaining({ groupId: GROUP_ID, userId: USER_ID }),
    );
  });

  it("throws 404 when not a member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    await expect(leaveGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when creator tries to leave", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });

    await expect(leaveGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ status: 403 });
  });
});

// ─── Channel enrollment assertions ──────────────────────────────────────────

describe("joinOpenGroup — channel enrollment", () => {
  it("enrolls the new member in all channel conversations", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue(null);
    mockListAllChannelConversationIds.mockResolvedValue(["conv-general", "conv-food"]);

    await joinOpenGroup(USER_ID, GROUP_ID);

    expect(mockListAllChannelConversationIds).toHaveBeenCalledWith(GROUP_ID);
    expect(mockAddMembersToConversation).toHaveBeenCalledWith("conv-general", [USER_ID]);
    expect(mockAddMembersToConversation).toHaveBeenCalledWith("conv-food", [USER_ID]);
  });

  it("skips enrollment when no channel conversations exist", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue(null);
    mockListAllChannelConversationIds.mockResolvedValue([]);

    await joinOpenGroup(USER_ID, GROUP_ID);

    expect(mockAddMembersToConversation).not.toHaveBeenCalled();
  });

  it("skips enrollment when already an active member (no-op path)", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    await joinOpenGroup(USER_ID, GROUP_ID);

    expect(mockListAllChannelConversationIds).not.toHaveBeenCalled();
    expect(mockAddMembersToConversation).not.toHaveBeenCalled();
  });
});

describe("approveJoinRequest — channel enrollment", () => {
  it("enrolls the approved member in all channel conversations", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "pending" });
    mockListAllChannelConversationIds.mockResolvedValue(["conv-general", "conv-food"]);

    await approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID);

    expect(mockListAllChannelConversationIds).toHaveBeenCalledWith(GROUP_ID);
    expect(mockAddMembersToConversation).toHaveBeenCalledWith("conv-general", [USER_ID]);
    expect(mockAddMembersToConversation).toHaveBeenCalledWith("conv-food", [USER_ID]);
  });

  it("skips enrollment when no channel conversations exist", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "pending" });
    mockListAllChannelConversationIds.mockResolvedValue([]);

    await approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID);

    expect(mockAddMembersToConversation).not.toHaveBeenCalled();
  });
});

// ─── System message assertions (Story 5.3) ──────────────────────────────────

function makeDbSelectChain(displayName: string) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ displayName }]),
  };
}

describe("joinOpenGroup — system messages", () => {
  it("sends system message when General channel exists", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue(null);
    mockGetDefaultChannelConversationId.mockResolvedValue("conv-1");
    mockDb.select.mockReturnValue(makeDbSelectChain("Alice"));

    await joinOpenGroup(USER_ID, GROUP_ID);

    expect(mockGetDefaultChannelConversationId).toHaveBeenCalledWith(GROUP_ID);
    expect(mockSendSystemMessage).toHaveBeenCalledWith("conv-1", USER_ID, "Alice joined the group");
  });

  it("skips system message when no General channel exists", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue(null);
    mockGetDefaultChannelConversationId.mockResolvedValue(null);

    await joinOpenGroup(USER_ID, GROUP_ID);

    expect(mockSendSystemMessage).not.toHaveBeenCalled();
  });

  it("falls back to 'A member' when display name not found", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup());
    mockGetGroupMember.mockResolvedValue(null);
    mockGetDefaultChannelConversationId.mockResolvedValue("conv-1");
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    await joinOpenGroup(USER_ID, GROUP_ID);

    expect(mockSendSystemMessage).toHaveBeenCalledWith(
      "conv-1",
      USER_ID,
      "A member joined the group",
    );
  });
});

describe("approveJoinRequest — system messages", () => {
  it("sends system message when General channel exists", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" }) // caller
      .mockResolvedValueOnce({ role: "member", status: "pending" }); // target
    mockGetDefaultChannelConversationId.mockResolvedValue("conv-1");
    mockDb.select.mockReturnValue(makeDbSelectChain("Charlie"));

    await approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID);

    expect(mockSendSystemMessage).toHaveBeenCalledWith(
      "conv-1",
      USER_ID,
      "Charlie joined the group",
    );
  });

  it("skips system message when no General channel exists", async () => {
    mockGetGroupMember
      .mockResolvedValueOnce({ role: "creator", status: "active" })
      .mockResolvedValueOnce({ role: "member", status: "pending" });
    mockGetDefaultChannelConversationId.mockResolvedValue(null);

    await approveJoinRequest(LEADER_ID, GROUP_ID, USER_ID);

    expect(mockSendSystemMessage).not.toHaveBeenCalled();
  });
});

describe("leaveGroup — system messages", () => {
  it("sends system message when General channel exists", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockGetDefaultChannelConversationId.mockResolvedValue("conv-1");
    mockDb.select.mockReturnValue(makeDbSelectChain("Bob"));

    await leaveGroup(USER_ID, GROUP_ID);

    expect(mockSendSystemMessage).toHaveBeenCalledWith("conv-1", USER_ID, "Bob left the group");
  });

  it("skips system message when no General channel exists", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockGetDefaultChannelConversationId.mockResolvedValue(null);

    await leaveGroup(USER_ID, GROUP_ID);

    expect(mockSendSystemMessage).not.toHaveBeenCalled();
  });
});
