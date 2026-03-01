// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/follows", () => ({
  followMember: vi.fn(),
  unfollowMember: vi.fn(),
  isFollowing: vi.fn(),
}));
vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));

import { followUser, unfollowUser, isUserFollowing } from "./follow-service";
import { followMember, unfollowMember, isFollowing } from "@/db/queries/follows";
import { eventBus } from "@/services/event-bus";

const mockFollowMember = vi.mocked(followMember);
const mockUnfollowMember = vi.mocked(unfollowMember);
const mockIsFollowing = vi.mocked(isFollowing);
const mockEmit = vi.mocked(eventBus.emit);

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mockFollowMember.mockResolvedValue(undefined);
  mockUnfollowMember.mockResolvedValue(undefined);
  mockIsFollowing.mockResolvedValue(false);
});

describe("followUser", () => {
  it("calls followMember and emits member.followed with correct payload", async () => {
    await followUser(USER_A, USER_B);

    expect(mockFollowMember).toHaveBeenCalledWith(USER_A, USER_B);
    expect(mockEmit).toHaveBeenCalledWith(
      "member.followed",
      expect.objectContaining({ followerId: USER_A, followedId: USER_B }),
    );
  });
});

describe("unfollowUser", () => {
  it("calls unfollowMember and emits member.unfollowed (no notification event)", async () => {
    await unfollowUser(USER_A, USER_B);

    expect(mockUnfollowMember).toHaveBeenCalledWith(USER_A, USER_B);
    expect(mockEmit).toHaveBeenCalledWith(
      "member.unfollowed",
      expect.objectContaining({ followerId: USER_A, followedId: USER_B }),
    );
  });
});

describe("isUserFollowing", () => {
  it("delegates to isFollowing and returns its result", async () => {
    mockIsFollowing.mockResolvedValue(true);

    const result = await isUserFollowing(USER_A, USER_B);

    expect(mockIsFollowing).toHaveBeenCalledWith(USER_A, USER_B);
    expect(result).toBe(true);
  });
});
