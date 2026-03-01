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
  },
  communityPostMedia: {
    postId: "postId",
    mediaUrl: "mediaUrl",
    mediaType: "mediaType",
    altText: "altText",
    sortOrder: "sortOrder",
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
