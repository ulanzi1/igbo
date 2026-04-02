// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock("../index", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

vi.mock("../schema/community-article-comments", () => ({
  communityArticleComments: {
    id: "id",
    articleId: "article_id",
    authorId: "author_id",
    content: "content",
    parentCommentId: "parent_comment_id",
    deletedAt: "deleted_at",
    createdAt: "created_at",
  },
}));

vi.mock("../schema/community-articles", () => ({
  communityArticles: {
    id: "id",
    commentCount: "comment_count",
  },
}));

vi.mock("../schema/community-profiles", () => ({
  communityProfiles: {
    userId: "user_id",
    displayName: "display_name",
    photoUrl: "photo_url",
  },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { addArticleComment, listArticleComments } from "./article-comments";

const ARTICLE_ID = "article-uuid-1";
const AUTHOR_ID = "author-uuid-1";
const COMMENT_ID = "comment-uuid-1";

describe("addArticleComment", () => {
  beforeEach(() => {
    mockDbTransaction.mockReset();
  });

  it("inserts comment and increments comment_count in a transaction", async () => {
    const mockComment = {
      id: COMMENT_ID,
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      content: "Great article!",
      createdAt: new Date(),
    };

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const returning = vi.fn().mockResolvedValue([mockComment]);
      const values = vi.fn().mockReturnValue({ returning });
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const tx = {
        insert: () => ({ values }),
        update: () => ({ set: updateSet }),
      };
      return fn(tx);
    });

    const result = await addArticleComment({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      content: "Great article!",
    });

    expect(result).toEqual(mockComment);
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
  });

  it("sets parentCommentId to null when not provided", async () => {
    const mockComment = {
      id: COMMENT_ID,
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      content: "Top-level comment",
      createdAt: new Date(),
    };
    let capturedValues: Record<string, unknown> | undefined;

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const returning = vi.fn().mockResolvedValue([mockComment]);
      const values = vi.fn().mockImplementation((v: unknown) => {
        capturedValues = v as Record<string, unknown>;
        return { returning };
      });
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const tx = {
        insert: () => ({ values }),
        update: () => ({ set: updateSet }),
      };
      return fn(tx);
    });

    await addArticleComment({ articleId: ARTICLE_ID, authorId: AUTHOR_ID, content: "Test" });
    expect(capturedValues?.parentCommentId).toBeNull();
  });
});

describe("listArticleComments", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns paginated comments with author JOIN", async () => {
    const mockComments = [
      {
        id: COMMENT_ID,
        articleId: ARTICLE_ID,
        authorId: AUTHOR_ID,
        authorName: "Test User",
        authorPhotoUrl: null,
        content: "Great read!",
        parentCommentId: null,
        createdAt: new Date(),
      },
    ];

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const offset = vi.fn().mockResolvedValue(mockComments);
        const limit = vi.fn().mockReturnValue({ offset });
        const orderBy = vi.fn().mockReturnValue({ limit });
        const where = vi.fn().mockReturnValue({ orderBy });
        const leftJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ leftJoin });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue([{ total: 1 }]);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const result = await listArticleComments(ARTICLE_ID);
    expect(result.items).toEqual(mockComments);
    expect(result.total).toBe(1);
  });

  it("returns empty list when no comments exist", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const offset = vi.fn().mockResolvedValue([]);
        const limit = vi.fn().mockReturnValue({ offset });
        const orderBy = vi.fn().mockReturnValue({ limit });
        const where = vi.fn().mockReturnValue({ orderBy });
        const leftJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ leftJoin });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue([{ total: 0 }]);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const result = await listArticleComments(ARTICLE_ID);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("respects pagination options", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const offset = vi.fn().mockResolvedValue([]);
        const limit = vi.fn().mockReturnValue({ offset });
        const orderBy = vi.fn().mockReturnValue({ limit });
        const where = vi.fn().mockReturnValue({ orderBy });
        const leftJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ leftJoin });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue([{ total: 5 }]);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const result = await listArticleComments(ARTICLE_ID, { page: 2, pageSize: 2 });
    expect(result.total).toBe(5);
  });

  it("returns correct total count", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const offset = vi.fn().mockResolvedValue([]);
        const limit = vi.fn().mockReturnValue({ offset });
        const orderBy = vi.fn().mockReturnValue({ limit });
        const where = vi.fn().mockReturnValue({ orderBy });
        const leftJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ leftJoin });
        return { from };
      } else {
        const where = vi.fn().mockResolvedValue([{ total: 42 }]);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const result = await listArticleComments(ARTICLE_ID);
    expect(result.total).toBe(42);
  });
});
