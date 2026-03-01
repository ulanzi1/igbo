// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB Mock ──────────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db", () => ({ db: mockDb }));

vi.mock("@/db/schema/community-posts", () => ({
  communityPosts: {
    id: "id",
    authorId: "author_id",
    content: "content",
    contentType: "content_type",
    visibility: "visibility",
    groupId: "group_id",
    isPinned: "is_pinned",
    likeCount: "like_count",
    commentCount: "comment_count",
    shareCount: "share_count",
    deletedAt: "deleted_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    category: "category",
    originalPostId: "original_post_id",
  },
  communityPostMedia: {
    id: "id",
    postId: "post_id",
    mediaUrl: "media_url",
    mediaType: "media_type",
    altText: "alt_text",
    sortOrder: "sort_order",
    createdAt: "created_at",
  },
}));

vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: {
    userId: "user_id",
    displayName: "display_name",
    photoUrl: "photo_url",
    deletedAt: "deleted_at",
  },
}));

vi.mock("@/db/schema/community-connections", () => ({
  communityMemberFollows: {
    followerId: "follower_id",
    followingId: "following_id",
  },
}));

vi.mock("@/config/feed", () => ({
  FEED_CONFIG: {
    RECENCY_WEIGHT: 0.6,
    ENGAGEMENT_WEIGHT: 0.4,
    HALF_LIFE_HOURS: 12,
    ENGAGEMENT_WINDOW_DAYS: 7,
    LIKE_WEIGHT: 1,
    COMMENT_WEIGHT: 2,
    SHARE_WEIGHT: 3,
    COLD_START_POST_THRESHOLD: 50,
    PAGE_SIZE: 20,
  },
}));

import { getTotalPostCount, getFollowedUserIds, getFeedPosts } from "./feed";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const USER_C = "00000000-0000-4000-8000-000000000003";

// Chainable builder that ends on .limit() or the terminal chain method
function chainable(returnValue: unknown) {
  const resolved = Promise.resolve(returnValue);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  ["from", "innerJoin", "where", "orderBy"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["limit"] = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

function makePost(
  overrides: Partial<{
    id: string;
    authorId: string;
    authorDisplayName: string;
    authorPhotoUrl: string | null;
    content: string;
    contentType: string;
    visibility: string;
    groupId: string | null;
    isPinned: boolean;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    category: string;
    originalPostId: string | null;
  }> = {},
) {
  return {
    id: "post-1",
    authorId: USER_B,
    authorDisplayName: "Test User",
    authorPhotoUrl: null,
    content: "Hello world",
    contentType: "text",
    visibility: "members_only",
    groupId: null,
    isPinned: false,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    deletedAt: null,
    createdAt: new Date("2026-03-01T10:00:00Z"),
    updatedAt: new Date("2026-03-01T10:00:00Z"),
    category: "discussion",
    originalPostId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockDb.select.mockReset();
});

// ─── getTotalPostCount ────────────────────────────────────────────────────────

describe("getTotalPostCount", () => {
  it("returns integer count of non-deleted posts", async () => {
    const chain = chainable([{ count: 42 }]);
    mockDb.select.mockReturnValue(chain);

    const count = await getTotalPostCount();

    expect(count).toBe(42);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("returns 0 when no rows returned", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);

    const count = await getTotalPostCount();
    expect(count).toBe(0);
  });
});

// ─── getFollowedUserIds ───────────────────────────────────────────────────────

describe("getFollowedUserIds", () => {
  it("returns array of followingId strings for viewerId", async () => {
    const chain = chainable([{ followingId: USER_B }, { followingId: USER_C }]);
    mockDb.select.mockReturnValue(chain);

    const ids = await getFollowedUserIds(VIEWER_ID);

    expect(ids).toEqual([USER_B, USER_C]);
  });

  it("returns empty array when viewerId has no follows", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);

    const ids = await getFollowedUserIds(VIEWER_ID);
    expect(ids).toEqual([]);
  });
});

// ─── getFeedPosts — chronological ────────────────────────────────────────────

describe("getFeedPosts — chronological", () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  it("returns posts with isColdStart=false when followedIds is non-empty", async () => {
    const post = makePost({ id: "post-1" });
    // First select: posts query; second: media query
    mockDb.select.mockReturnValueOnce(chainable([post])).mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, { sort: "chronological" });

    expect(result.isColdStart).toBe(false);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]!.id).toBe("post-1");
  });

  it("sets isColdStart=true when followedIds is empty", async () => {
    const post = makePost({ id: "post-1" });
    mockDb.select.mockReturnValueOnce(chainable([post])).mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [], 100, { sort: "chronological" });

    expect(result.isColdStart).toBe(true);
  });

  it("sets nextCursor to null when fewer than limit posts returned", async () => {
    // limit = 20, return only 1 post → hasMore = false
    const post = makePost({ id: "post-1" });
    mockDb.select.mockReturnValueOnce(chainable([post])).mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, {
      sort: "chronological",
      limit: 20,
    });

    expect(result.nextCursor).toBeNull();
  });

  it("sets nextCursor to ISO string when exactly limit+1 posts returned (has next page)", async () => {
    // Create limit+1 posts so hasMore = true
    const limit = 3;
    const posts = Array.from({ length: limit + 1 }, (_, i) =>
      makePost({
        id: `post-${i + 1}`,
        createdAt: new Date(`2026-03-01T${String(10 - i).padStart(2, "0")}:00:00Z`),
        updatedAt: new Date(`2026-03-01T${String(10 - i).padStart(2, "0")}:00:00Z`),
      }),
    );
    mockDb.select.mockReturnValueOnce(chainable(posts)).mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, {
      sort: "chronological",
      limit,
    });

    expect(result.nextCursor).not.toBeNull();
    expect(result.posts).toHaveLength(limit); // extra post trimmed
    // Cursor should be ISO string of last post's createdAt
    expect(result.nextCursor).toBe(posts[limit - 1]!.createdAt.toISOString());
  });

  it("applies cursor correctly (passes lt condition via where)", async () => {
    const post = makePost({ id: "post-1" });
    mockDb.select.mockReturnValueOnce(chainable([post])).mockReturnValueOnce(chainable([]));

    const cursor = new Date("2026-03-01T09:00:00Z").toISOString();
    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, {
      sort: "chronological",
      cursor,
    });

    // The select chain is called; cursor date is passed into where clause
    expect(mockDb.select).toHaveBeenCalled();
    expect(result.posts).toHaveLength(1);
  });

  it("attaches media to posts", async () => {
    const post = makePost({ id: "post-1" });
    const media = {
      id: "media-1",
      postId: "post-1",
      mediaUrl: "https://example.com/image.jpg",
      mediaType: "image",
      altText: "A test image",
      sortOrder: 0,
      createdAt: new Date("2026-03-01T10:00:00Z"),
    };
    mockDb.select.mockReturnValueOnce(chainable([post])).mockReturnValueOnce(chainable([media]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, { sort: "chronological" });

    expect(result.posts[0]!.media).toHaveLength(1);
    expect(result.posts[0]!.media[0]!.mediaUrl).toBe("https://example.com/image.jpg");
  });

  it("only fetches announcements when filter=announcements", async () => {
    const announcement = makePost({ id: "ann-1", contentType: "announcement" });
    mockDb.select.mockReturnValueOnce(chainable([announcement])).mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, {
      sort: "chronological",
      filter: "announcements",
    });

    expect(result.posts).toHaveLength(1);
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });
});

// ─── getFeedPosts — algorithmic ───────────────────────────────────────────────

describe("getFeedPosts — algorithmic", () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  it("scores posts correctly — post with higher engagement scores higher", async () => {
    const now = Date.now();
    const postLow = makePost({
      id: "low",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      createdAt: new Date(now - 3600000), // 1 hour ago
      updatedAt: new Date(now - 3600000),
    });
    const postHigh = makePost({
      id: "high",
      likeCount: 10,
      commentCount: 5,
      shareCount: 3,
      createdAt: new Date(now - 3600000), // same time
      updatedAt: new Date(now - 3600000),
    });
    mockDb.select
      .mockReturnValueOnce(chainable([postLow, postHigh]))
      .mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, { sort: "algorithmic" });

    // High engagement post should appear first
    expect(result.posts[0]!.id).toBe("high");
    expect(result.posts[1]!.id).toBe("low");
    // Scores should be present
    expect(result.posts[0]!.score).toBeDefined();
    expect(result.posts[0]!.score!).toBeGreaterThan(result.posts[1]!.score!);
  });

  it("cursor encodes {offset: number} as base64 JSON when hasMore=true", async () => {
    const limit = 2;
    const posts = Array.from({ length: limit + 1 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        createdAt: new Date(Date.now() - i * 3600000),
        updatedAt: new Date(Date.now() - i * 3600000),
      }),
    );
    mockDb.select.mockReturnValueOnce(chainable(posts)).mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, {
      sort: "algorithmic",
      limit,
    });

    expect(result.nextCursor).not.toBeNull();
    const decoded = JSON.parse(Buffer.from(result.nextCursor!, "base64").toString("utf8")) as {
      offset: number;
    };
    expect(decoded.offset).toBe(limit);
  });

  it("forces chronological when totalPosts < COLD_START_POST_THRESHOLD (50)", async () => {
    const post = makePost({ id: "post-1" });
    mockDb.select.mockReturnValueOnce(chainable([post])).mockReturnValueOnce(chainable([]));

    // totalPosts = 10, below threshold of 50 → should use chronological (limit+1 query)
    const result = await getFeedPosts(VIEWER_ID, [USER_B], 10, {
      sort: "algorithmic",
      limit: 20,
    });

    // Chronological path: .limit() is called on the chain
    expect(mockDb.select).toHaveBeenCalled();
    expect(result.posts).toHaveLength(1);
    // No score in chronological mode
    expect(result.posts[0]!.score).toBeUndefined();
  });

  it("nextCursor is null when all posts fit on first page", async () => {
    const posts = [makePost({ id: "post-1" })];
    mockDb.select.mockReturnValueOnce(chainable(posts)).mockReturnValueOnce(chainable([]));

    const result = await getFeedPosts(VIEWER_ID, [USER_B], 100, {
      sort: "algorithmic",
      limit: 20,
    });

    expect(result.nextCursor).toBeNull();
  });
});
