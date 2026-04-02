// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockIsBlocked = vi.fn();
const mockBlockUser = vi.fn();
const mockUnblockUser = vi.fn();
const mockIsMuted = vi.fn();
const mockMuteUser = vi.fn();
const mockUnmuteUser = vi.fn();
const mockGetBlockedUserIds = vi.fn();
const mockGetUsersWhoBlocked = vi.fn();
const mockGetUsersWhoMuted = vi.fn();

vi.mock("@/db/queries/block-mute", () => ({
  isBlocked: (...args: unknown[]) => mockIsBlocked(...args),
  blockUser: (...args: unknown[]) => mockBlockUser(...args),
  unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
  isMuted: (...args: unknown[]) => mockIsMuted(...args),
  muteUser: (...args: unknown[]) => mockMuteUser(...args),
  unmuteUser: (...args: unknown[]) => mockUnmuteUser(...args),
  getBlockedUserIds: (...args: unknown[]) => mockGetBlockedUserIds(...args),
  getUsersWhoBlocked: (...args: unknown[]) => mockGetUsersWhoBlocked(...args),
  getUsersWhoMuted: (...args: unknown[]) => mockGetUsersWhoMuted(...args),
}));

import {
  blockMember,
  unblockMember,
  isUserBlocked,
  muteMember,
  unmuteMember,
  isUserMuted,
  getBlockList,
  getWhoBlockedUser,
  filterNotificationRecipients,
} from "./block-service";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const USER_C = "00000000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUsersWhoMuted.mockResolvedValue([]);
  mockGetUsersWhoBlocked.mockResolvedValue([]);
});

describe("blockMember", () => {
  it("calls blockUser with correct args", async () => {
    mockBlockUser.mockResolvedValue(undefined);
    await blockMember(USER_A, USER_B);
    expect(mockBlockUser).toHaveBeenCalledWith(USER_A, USER_B);
  });
});

describe("unblockMember", () => {
  it("calls unblockUser with correct args", async () => {
    mockUnblockUser.mockResolvedValue(undefined);
    await unblockMember(USER_A, USER_B);
    expect(mockUnblockUser).toHaveBeenCalledWith(USER_A, USER_B);
  });
});

describe("isUserBlocked", () => {
  it("returns true when blocked", async () => {
    mockIsBlocked.mockResolvedValue(true);
    const result = await isUserBlocked(USER_A, USER_B);
    expect(result).toBe(true);
  });

  it("returns false when not blocked", async () => {
    mockIsBlocked.mockResolvedValue(false);
    const result = await isUserBlocked(USER_A, USER_B);
    expect(result).toBe(false);
  });
});

describe("muteMember", () => {
  it("calls muteUser with correct args", async () => {
    mockMuteUser.mockResolvedValue(undefined);
    await muteMember(USER_A, USER_B);
    expect(mockMuteUser).toHaveBeenCalledWith(USER_A, USER_B);
  });
});

describe("unmuteMember", () => {
  it("calls unmuteUser with correct args", async () => {
    mockUnmuteUser.mockResolvedValue(undefined);
    await unmuteMember(USER_A, USER_B);
    expect(mockUnmuteUser).toHaveBeenCalledWith(USER_A, USER_B);
  });
});

describe("isUserMuted", () => {
  it("returns muted status from query", async () => {
    mockIsMuted.mockResolvedValue(true);
    const result = await isUserMuted(USER_A, USER_B);
    expect(result).toBe(true);
  });
});

describe("getBlockList", () => {
  it("returns blocked user IDs", async () => {
    mockGetBlockedUserIds.mockResolvedValue([USER_B, USER_C]);
    const result = await getBlockList(USER_A);
    expect(result).toEqual([USER_B, USER_C]);
  });
});

describe("getWhoBlockedUser", () => {
  it("returns IDs of users who blocked the actor", async () => {
    mockGetUsersWhoBlocked.mockResolvedValue([USER_B]);
    const result = await getWhoBlockedUser(USER_A);
    expect(result).toEqual([USER_B]);
  });
});

describe("filterNotificationRecipients", () => {
  it("returns empty array when input is empty", async () => {
    const result = await filterNotificationRecipients([], USER_A);
    expect(result).toEqual([]);
    expect(mockGetUsersWhoBlocked).not.toHaveBeenCalled();
  });

  it("filters out users who blocked the actor", async () => {
    mockGetUsersWhoBlocked.mockResolvedValue([USER_B]); // USER_B blocked USER_A
    const result = await filterNotificationRecipients([USER_B, USER_C], USER_A);
    expect(result).toEqual([USER_C]);
  });

  it("filters out users who muted the actor", async () => {
    mockGetUsersWhoMuted.mockResolvedValue([USER_B]); // USER_B muted USER_A
    const result = await filterNotificationRecipients([USER_B, USER_C], USER_A);
    expect(result).toEqual([USER_C]);
  });

  it("filters out the actor themselves", async () => {
    const result = await filterNotificationRecipients([USER_A, USER_B], USER_A);
    expect(result).toEqual([USER_B]);
  });

  it("allows all recipients when no blocks or mutes exist", async () => {
    const result = await filterNotificationRecipients([USER_B, USER_C], USER_A);
    expect(result).toEqual([USER_B, USER_C]);
  });

  it("filters out both blocked and muted users", async () => {
    mockGetUsersWhoBlocked.mockResolvedValue([USER_B]); // USER_B blocked USER_A
    mockGetUsersWhoMuted.mockResolvedValue([USER_C]); // USER_C muted USER_A
    const result = await filterNotificationRecipients([USER_A, USER_B, USER_C], USER_A);
    expect(result).toEqual([]);
  });
});
