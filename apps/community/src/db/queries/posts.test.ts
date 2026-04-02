// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/env", () => ({
  env: { HETZNER_S3_PUBLIC_URL: "https://cdn.example.com" },
}));

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbFrom = vi.fn();
const mockDbWhere = vi.fn();
const mockDbValues = vi.fn();
const mockDbReturning = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("@/db/schema/community-posts", () => ({
  communityPosts: {
    authorId: "authorId",
    deletedAt: "deletedAt",
    groupId: "groupId",
    createdAt: "createdAt",
    id: "id",
    content: "content",
    contentType: "contentType",
    visibility: "visibility",
    category: "category",
    originalPostId: "originalPostId",
    status: "status",
  },
  communityPostMedia: {
    id: "id",
    postId: "postId",
    mediaUrl: "mediaUrl",
    mediaType: "mediaType",
    altText: "altText",
    sortOrder: "sortOrder",
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

vi.mock("@/db/schema/file-uploads", () => ({
  platformFileUploads: {
    id: "id",
    processedUrl: "processedUrl",
    objectKey: "objectKey",
    fileType: "fileType",
  },
}));

import {
  getWeeklyFeedPostCount,
  insertPost,
  insertPostMedia,
  resolveFileUploadUrls,
  listPendingGroupPosts,
  getPostContentLength,
} from "./posts";

// Helper to build fluent DB query chain mocks
function buildSelectChain(result: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function buildInsertChain(result: unknown) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  mockDbInsert.mockReturnValue(chain);
  return chain;
}

function buildInsertChainNoReturn() {
  const chain = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  mockDbInsert.mockReturnValue(chain);
  return chain;
}

function buildSelectChainWithLimit(result: unknown) {
  const resolved = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  ["from", "innerJoin", "where", "orderBy"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["limit"] = vi.fn().mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  mockDbSelect.mockReset();
  mockDbInsert.mockReset();
});

describe("getWeeklyFeedPostCount", () => {
  it("returns 0 when no posts this week", async () => {
    buildSelectChain([{ count: 0 }]);
    const result = await getWeeklyFeedPostCount("author-1");
    expect(result).toBe(0);
  });

  it("returns count of posts from current week", async () => {
    buildSelectChain([{ count: 3 }]);
    const result = await getWeeklyFeedPostCount("author-1");
    expect(result).toBe(3);
  });

  it("returns 0 when DB returns empty array (no rows)", async () => {
    buildSelectChain([]);
    const result = await getWeeklyFeedPostCount("author-1");
    expect(result).toBe(0);
  });

  it("uses Monday 00:00 UTC as week start boundary", async () => {
    buildSelectChain([{ count: 1 }]);
    await getWeeklyFeedPostCount("author-1");
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it("calls db.select for the query", async () => {
    buildSelectChain([{ count: 2 }]);
    await getWeeklyFeedPostCount("user-1");
    expect(mockDbSelect).toHaveBeenCalled();
  });
});

describe("insertPost", () => {
  it("inserts with correct fields and returns the created row", async () => {
    const fakePost = {
      id: "post-1",
      authorId: "user-1",
      content: "Hello",
      contentType: "text",
      visibility: "members_only",
      category: "discussion",
    };
    buildInsertChain([fakePost]);

    const result = await insertPost({
      authorId: "user-1",
      content: "Hello",
      contentType: "text",
      visibility: "members_only",
      category: "discussion",
    });

    expect(result).toEqual(fakePost);
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("returns the first row from DB response", async () => {
    const fakePost = { id: "post-xyz" };
    buildInsertChain([fakePost, { id: "other" }]);

    const result = await insertPost({
      authorId: "u",
      content: "c",
      contentType: "rich_text",
      visibility: "members_only",
      category: "event",
    });

    expect(result).toEqual(fakePost);
  });

  it("passes originalPostId when provided", async () => {
    const fakePost = { id: "repost-1", originalPostId: "orig-123" };
    const chain = buildInsertChain([fakePost]);

    const result = await insertPost({
      authorId: "u",
      content: "",
      contentType: "text",
      visibility: "members_only",
      category: "discussion",
      originalPostId: "orig-123",
    });

    expect(result).toEqual(fakePost);
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ originalPostId: "orig-123" }),
    );
  });
});

describe("insertPostMedia", () => {
  it("calls db.insert with media rows", async () => {
    buildInsertChainNoReturn();

    await insertPostMedia("post-1", [
      { mediaUrl: "https://cdn.example.com/img.jpg", mediaType: "image", sortOrder: 0 },
    ]);

    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("skips db.insert when media array is empty", async () => {
    await insertPostMedia("post-1", []);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("inserts multiple media rows", async () => {
    buildInsertChainNoReturn();

    await insertPostMedia("post-1", [
      { mediaUrl: "https://cdn.example.com/img1.jpg", mediaType: "image", sortOrder: 0 },
      { mediaUrl: "https://cdn.example.com/img2.jpg", mediaType: "image", sortOrder: 1 },
    ]);

    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });
});

describe("resolveFileUploadUrls", () => {
  it("returns empty map for empty input", async () => {
    const result = await resolveFileUploadUrls([]);
    expect(result.size).toBe(0);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns processedUrl when available", async () => {
    buildSelectChain([
      {
        id: "file-1",
        processedUrl: "https://cdn.example.com/processed/img.webp",
        objectKey: "uploads/img.jpg",
        fileType: "image/jpeg",
      },
    ]);

    const result = await resolveFileUploadUrls(["file-1"]);
    expect(result.get("file-1")?.mediaUrl).toBe("https://cdn.example.com/processed/img.webp");
    expect(result.get("file-1")?.fileType).toBe("image/jpeg");
  });

  it("falls back to HETZNER_S3_PUBLIC_URL/objectKey when processedUrl is null", async () => {
    buildSelectChain([
      {
        id: "file-2",
        processedUrl: null,
        objectKey: "uploads/raw.jpg",
        fileType: "image/jpeg",
      },
    ]);

    const result = await resolveFileUploadUrls(["file-2"]);
    expect(result.get("file-2")?.mediaUrl).toBe("https://cdn.example.com/uploads/raw.jpg");
  });

  it("returns multiple file URLs", async () => {
    buildSelectChain([
      {
        id: "file-1",
        processedUrl: "https://cdn.example.com/p1.webp",
        objectKey: "uploads/p1.jpg",
        fileType: "image/jpeg",
      },
      {
        id: "file-2",
        processedUrl: null,
        objectKey: "uploads/p2.jpg",
        fileType: "image/jpeg",
      },
    ]);

    const result = await resolveFileUploadUrls(["file-1", "file-2"]);
    expect(result.size).toBe(2);
    expect(result.get("file-1")?.mediaUrl).toBe("https://cdn.example.com/p1.webp");
    expect(result.get("file-2")?.mediaUrl).toBe("https://cdn.example.com/uploads/p2.jpg");
  });
});

describe("listPendingGroupPosts", () => {
  const GROUP_ID = "group-1";
  const POST_ID_1 = "post-1";
  const POST_ID_2 = "post-2";
  const AUTHOR_ID = "author-1";
  const BASE_DATE = new Date("2026-03-01T10:00:00Z");
  const LATER_DATE = new Date("2026-03-02T10:00:00Z");

  function makeRow(id: string, createdAt: Date) {
    return {
      id,
      authorId: AUTHOR_ID,
      authorDisplayName: "Bob Smith",
      authorPhotoUrl: "https://cdn.example.com/bob.jpg",
      content: "Hello",
      contentType: "text",
      createdAt,
    };
  }

  it("returns empty result when no pending posts", async () => {
    mockDbSelect.mockReturnValueOnce(buildSelectChainWithLimit([]));

    const result = await listPendingGroupPosts(GROUP_ID);
    expect(result).toEqual({ posts: [], nextCursor: null });
  });

  it("returns enriched posts with author name and empty media when no attachments", async () => {
    const rows = [makeRow(POST_ID_1, BASE_DATE)];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit(rows))
      .mockReturnValueOnce(buildSelectChainWithLimit([]));

    const result = await listPendingGroupPosts(GROUP_ID);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].authorDisplayName).toBe("Bob Smith");
    expect(result.posts[0].authorPhotoUrl).toBe("https://cdn.example.com/bob.jpg");
    expect(result.posts[0].media).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("attaches media to the correct post", async () => {
    const rows = [makeRow(POST_ID_1, BASE_DATE)];
    const mediaRows = [
      {
        id: "m1",
        postId: POST_ID_1,
        mediaUrl: "https://cdn.example.com/img.jpg",
        mediaType: "image",
        sortOrder: 0,
      },
    ];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit(rows))
      .mockReturnValueOnce(buildSelectChainWithLimit(mediaRows));

    const result = await listPendingGroupPosts(GROUP_ID);
    expect(result.posts[0].media).toHaveLength(1);
    expect(result.posts[0].media[0].mediaUrl).toBe("https://cdn.example.com/img.jpg");
    expect(result.posts[0].media[0].mediaType).toBe("image");
  });

  it("sets nextCursor to last post's createdAt ISO string when more posts exist beyond limit", async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      makeRow(`post-${i}`, new Date(Date.UTC(2026, 2, i + 1))),
    );
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit(rows))
      .mockReturnValueOnce(buildSelectChainWithLimit([]));

    const result = await listPendingGroupPosts(GROUP_ID, { limit: 10 });
    expect(result.posts).toHaveLength(10);
    expect(result.nextCursor).toBe(rows[9].createdAt.toISOString());
  });

  it("returns nextCursor null on last page", async () => {
    const rows = [makeRow(POST_ID_1, BASE_DATE), makeRow(POST_ID_2, LATER_DATE)];
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit(rows))
      .mockReturnValueOnce(buildSelectChainWithLimit([]));

    const result = await listPendingGroupPosts(GROUP_ID, { limit: 10 });
    expect(result.posts).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("skips media fetch when no posts returned", async () => {
    mockDbSelect.mockReturnValueOnce(buildSelectChainWithLimit([]));

    await listPendingGroupPosts(GROUP_ID);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });
});

// ─── getPostContentLength ──────────────────────────────────────────────────────

describe("getPostContentLength", () => {
  it("returns character length (whitespace-stripped) when post exists", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ len: 42 }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbSelect.mockReturnValue({ from: mockFrom });

    const result = await getPostContentLength("post-1");

    expect(result).toBe(42);
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it("returns null when post not found or deleted", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbSelect.mockReturnValue({ from: mockFrom });

    const result = await getPostContentLength("deleted-post");

    expect(result).toBeNull();
  });
});
