// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/feed", () => ({
  getTotalPostCount: vi.fn(),
  getFollowedUserIds: vi.fn(),
  getFeedPosts: vi.fn(),
}));

import { getFeed } from "./feed-service";
import { getTotalPostCount, getFollowedUserIds, getFeedPosts } from "@igbo/db/queries/feed";

const mockGetTotalPostCount = vi.mocked(getTotalPostCount);
const mockGetFollowedUserIds = vi.mocked(getFollowedUserIds);
const mockGetFeedPosts = vi.mocked(getFeedPosts);

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";

const MOCK_FEED_PAGE = {
  posts: [],
  nextCursor: null,
  isColdStart: false,
};

beforeEach(() => {
  mockGetTotalPostCount.mockReset();
  mockGetFollowedUserIds.mockReset();
  mockGetFeedPosts.mockReset();
});

describe("getFeed", () => {
  it("calls getTotalPostCount and getFollowedUserIds in parallel (Promise.all)", async () => {
    mockGetTotalPostCount.mockResolvedValue(100);
    mockGetFollowedUserIds.mockResolvedValue(["user-b"]);
    mockGetFeedPosts.mockResolvedValue(MOCK_FEED_PAGE);

    await getFeed(VIEWER_ID, {});

    expect(mockGetTotalPostCount).toHaveBeenCalledOnce();
    expect(mockGetFollowedUserIds).toHaveBeenCalledWith(VIEWER_ID);
  });

  it("passes results to getFeedPosts with the viewerId and options", async () => {
    const followedIds = ["user-b", "user-c"];
    const totalPosts = 75;
    const options = { sort: "algorithmic" as const, filter: "all" as const };

    mockGetTotalPostCount.mockResolvedValue(totalPosts);
    mockGetFollowedUserIds.mockResolvedValue(followedIds);
    mockGetFeedPosts.mockResolvedValue(MOCK_FEED_PAGE);

    await getFeed(VIEWER_ID, options);

    expect(mockGetFeedPosts).toHaveBeenCalledWith(VIEWER_ID, followedIds, totalPosts, options);
  });

  it("returns the page from getFeedPosts", async () => {
    const page = {
      posts: [
        {
          id: "post-1",
          authorId: "user-b",
          authorDisplayName: "Test User",
          authorPhotoUrl: null,
          content: "Hello",
          contentType: "text" as const,
          visibility: "members_only" as const,
          groupId: null,
          isPinned: false,
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          media: [],
          createdAt: "2026-03-01T10:00:00.000Z",
          updatedAt: "2026-03-01T10:00:00.000Z",
        },
      ],
      nextCursor: "abc123",
      isColdStart: false,
    };

    mockGetTotalPostCount.mockResolvedValue(100);
    mockGetFollowedUserIds.mockResolvedValue(["user-b"]);
    mockGetFeedPosts.mockResolvedValue(page);

    const result = await getFeed(VIEWER_ID, {});

    expect(result).toBe(page);
  });
});
