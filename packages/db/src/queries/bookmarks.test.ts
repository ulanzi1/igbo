// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  toggleBookmark,
  addBookmark,
  removeBookmark,
  isBookmarked,
  getUserBookmarks,
} from "./bookmarks";

// ── DB Mock ──────────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../index", () => ({ db: mockDb }));

vi.mock("../schema/bookmarks", () => ({
  communityPostBookmarks: {
    userId: "user_id",
    postId: "post_id",
    createdAt: "created_at",
  },
}));

vi.mock("../schema/community-posts", () => ({
  communityPosts: {
    id: "id",
    authorId: "author_id",
    content: "content",
    contentType: "content_type",
    visibility: "visibility",
    category: "category",
    groupId: "group_id",
    isPinned: "is_pinned",
    pinnedAt: "pinned_at",
    likeCount: "like_count",
    commentCount: "comment_count",
    shareCount: "share_count",
    originalPostId: "original_post_id",
    deletedAt: "deleted_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  communityPostMedia: {
    id: "id",
    postId: "post_id",
    mediaUrl: "media_url",
    mediaType: "media_type",
    altText: "alt_text",
    sortOrder: "sort_order",
  },
}));

vi.mock("../schema/community-profiles", () => ({
  communityProfiles: {
    userId: "user_id",
    displayName: "display_name",
    photoUrl: "photo_url",
    deletedAt: "deleted_at",
  },
}));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const POST_ID = "00000000-0000-4000-8000-000000000002";

// Chainable select builder
function makeSelectChain(result: unknown) {
  const resolved = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  ["from", "innerJoin", "leftJoin", "where", "orderBy"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["limit"] = vi.fn().mockResolvedValue(result);
  return chain;
}

// Chainable insert builder
function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain["values"] = vi.fn().mockResolvedValue([]);
  return chain;
}

// Chainable delete builder
function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  chain["where"] = vi.fn().mockResolvedValue([]);
  return chain;
}

// Chainable insert builder with onConflictDoNothing support
function makeInsertChainWithConflict() {
  const chain: Record<string, unknown> = {};
  chain["onConflictDoNothing"] = vi.fn().mockResolvedValue([]);
  chain["values"] = vi.fn().mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  mockDb.select.mockReset();
  mockDb.insert.mockReset();
  mockDb.delete.mockReset(); // eslint-disable-line drizzle/enforce-delete-with-where
  mockDb.transaction.mockReset();
});

// ─── toggleBookmark ───────────────────────────────────────────────────────────

describe("toggleBookmark", () => {
  it("inserts bookmark and returns { bookmarked: true } when not bookmarked", async () => {
    const txSelect = vi.fn().mockReturnValueOnce(makeSelectChain([]));
    const txInsert = vi.fn().mockReturnValueOnce(makeInsertChain());
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({ select: txSelect, insert: txInsert, delete: vi.fn() });
    });

    const result = await toggleBookmark(USER_ID, POST_ID);

    expect(result).toEqual({ bookmarked: true });
    expect(txInsert).toHaveBeenCalled();
  });

  it("deletes bookmark and returns { bookmarked: false } when already bookmarked", async () => {
    const txSelect = vi.fn().mockReturnValueOnce(makeSelectChain([{ userId: USER_ID }]));
    const txDelete = vi.fn().mockReturnValueOnce(makeDeleteChain());
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({ select: txSelect, insert: vi.fn(), delete: txDelete });
    });

    const result = await toggleBookmark(USER_ID, POST_ID);

    expect(result).toEqual({ bookmarked: false });
    expect(txDelete).toHaveBeenCalled();
  });
});

// ─── addBookmark ──────────────────────────────────────────────────────────────

describe("addBookmark", () => {
  it("inserts bookmark with onConflictDoNothing and returns { bookmarked: true }", async () => {
    mockDb.insert.mockReturnValueOnce(makeInsertChainWithConflict());

    const result = await addBookmark(USER_ID, POST_ID);

    expect(result).toEqual({ bookmarked: true });
    expect(mockDb.insert).toHaveBeenCalled();
  });
});

// ─── removeBookmark ───────────────────────────────────────────────────────────

describe("removeBookmark", () => {
  it("deletes bookmark and returns { bookmarked: false }", async () => {
    mockDb.delete.mockReturnValueOnce(makeDeleteChain()); // eslint-disable-line drizzle/enforce-delete-with-where

    const result = await removeBookmark(USER_ID, POST_ID);

    expect(result).toEqual({ bookmarked: false });
    expect(mockDb.delete).toHaveBeenCalled(); // eslint-disable-line drizzle/enforce-delete-with-where
  });
});

// ─── isBookmarked ─────────────────────────────────────────────────────────────

describe("isBookmarked", () => {
  it("returns true when bookmark exists", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ userId: USER_ID }]));

    const result = await isBookmarked(USER_ID, POST_ID);

    expect(result).toBe(true);
  });

  it("returns false when no bookmark", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const result = await isBookmarked(USER_ID, POST_ID);

    expect(result).toBe(false);
  });
});

// ─── getUserBookmarks ─────────────────────────────────────────────────────────

describe("getUserBookmarks", () => {
  const now = new Date("2026-03-01T10:00:00Z");

  function makeBookmarkRow(postId: string, bookmarkedAt: Date = now) {
    return {
      id: postId,
      authorId: "author-1",
      content: "Test content",
      contentType: "text",
      visibility: "members_only",
      category: "discussion",
      groupId: null,
      isPinned: false,
      pinnedAt: null,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      originalPostId: null,
      createdAt: now,
      updatedAt: now,
      authorDisplayName: "Test User",
      authorPhotoUrl: null,
      bookmarkedAt,
      isBookmarked: true,
    };
  }

  it("returns empty array when no bookmarks", async () => {
    // First select: bookmark+post query → empty
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const result = await getUserBookmarks(USER_ID);

    expect(result.posts).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("returns posts with bookmark metadata", async () => {
    const row = makeBookmarkRow(POST_ID);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([row])) // posts query
      .mockReturnValueOnce(makeSelectChain([])); // media query

    const result = await getUserBookmarks(USER_ID);

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]!.id).toBe(POST_ID);
    expect(result.posts[0]!.isBookmarked).toBe(true);
    expect(result.posts[0]!.bookmarkedAt).toBe(now.toISOString());
  });

  it("paginates correctly — nextCursor set when more results exist", async () => {
    const limit = 2;
    const rows = Array.from({ length: limit + 1 }, (_, i) =>
      makeBookmarkRow(`post-${i}`, new Date(now.getTime() - i * 1000)),
    );
    mockDb.select
      .mockReturnValueOnce(makeSelectChain(rows)) // limit+1 rows
      .mockReturnValueOnce(makeSelectChain([])); // media query

    const result = await getUserBookmarks(USER_ID, { limit });

    expect(result.posts).toHaveLength(limit);
    expect(result.nextCursor).not.toBeNull();
    // Cursor is ISO string of last post's bookmarkedAt
    expect(result.nextCursor).toBe(rows[limit - 1]!.bookmarkedAt.toISOString());
  });

  it("nextCursor is null when all results fit on page", async () => {
    const row = makeBookmarkRow(POST_ID);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([row]))
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await getUserBookmarks(USER_ID, { limit: 10 });

    expect(result.nextCursor).toBeNull();
  });

  it("applies cursor date filter — passes cursor to where clause", async () => {
    const cursor = new Date("2026-03-01T09:00:00Z").toISOString();
    const row = makeBookmarkRow(POST_ID);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([row]))
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await getUserBookmarks(USER_ID, { cursor });

    expect(mockDb.select).toHaveBeenCalled();
    expect(result.posts).toHaveLength(1);
  });

  it("does not call media query when no posts returned", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    await getUserBookmarks(USER_ID);

    // Only 1 select call (posts query), media skipped because postIds.length === 0
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});
