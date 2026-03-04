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
}));
vi.mock("@/services/permissions", () => ({
  canCreateGroup: vi.fn(),
}));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status, detail }: { title: string; status: number; detail?: string }) {
      super(detail ?? title);
      this.status = status;
    }
  },
}));

import { createGroupForUser, updateGroupSettings, getGroupDetails } from "./group-service";
import { createGroup, updateGroup, getGroupById, getGroupMember } from "@/db/queries/groups";
import { canCreateGroup } from "@/services/permissions";
import { eventBus } from "@/services/event-bus";

const mockCreateGroup = vi.mocked(createGroup);
const mockUpdateGroup = vi.mocked(updateGroup);
const mockGetGroupById = vi.mocked(getGroupById);
const mockGetGroupMember = vi.mocked(getGroupMember);
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

beforeEach(() => {
  mockCreateGroup.mockReset();
  mockUpdateGroup.mockReset();
  mockGetGroupById.mockReset();
  mockGetGroupMember.mockReset();
  mockCanCreateGroup.mockReset();
  mockEmit.mockReset();

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
