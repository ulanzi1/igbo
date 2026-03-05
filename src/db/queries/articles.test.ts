// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();
const mockDbDelete = vi.fn();
const mockDbTransaction = vi.fn();
const mockDbExecute = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
    execute: (...args: unknown[]) => mockDbExecute(...args),
  },
}));

vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: {
    userId: "user_id",
    displayName: "display_name",
  },
}));

vi.mock("@/db/schema/community-articles", () => ({
  communityArticles: {
    id: "id",
    authorId: "author_id",
    title: "title",
    titleIgbo: "title_igbo",
    slug: "slug",
    content: "content",
    contentIgbo: "content_igbo",
    coverImageUrl: "cover_image_url",
    language: "language",
    visibility: "visibility",
    status: "status",
    category: "category",
    isFeatured: "is_featured",
    readingTimeMinutes: "reading_time_minutes",
    viewCount: "view_count",
    likeCount: "like_count",
    commentCount: "comment_count",
    rejectionFeedback: "rejection_feedback",
    deletedAt: "deleted_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  communityArticleTags: {
    articleId: "article_id",
    tag: "tag",
  },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import {
  createArticle,
  updateArticle,
  submitArticleForReview,
  countWeeklyArticleSubmissions,
  upsertArticleTags,
  getArticleForEditing,
  listPendingArticles,
  listPublishedArticles,
  getArticleByIdForAdmin,
  publishArticleById,
  rejectArticleById,
  requestRevisionById,
  toggleArticleFeature,
  incrementArticleViewCount,
  getRelatedArticles,
  getArticleTagsById,
  listArticlesByAuthor,
} from "./articles";

const AUTHOR_ID = "author-uuid-1";
const ARTICLE_ID = "article-uuid-1";

describe("createArticle", () => {
  beforeEach(() => {
    mockDbInsert.mockReset();
  });

  it("inserts and returns id + slug", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: ARTICLE_ID, slug: "test-slug-abc123" }]);
    const values = vi.fn().mockReturnValue({ returning });
    mockDbInsert.mockReturnValue({ values });

    const result = await createArticle({
      authorId: AUTHOR_ID,
      title: "Test Article",
      slug: "test-slug-abc123",
      content: '{"type":"doc","content":[]}',
      language: "en",
      visibility: "members_only",
      category: "discussion",
      readingTimeMinutes: 1,
    });

    expect(result).toEqual({ id: ARTICLE_ID, slug: "test-slug-abc123" });
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });
});

describe("updateArticle", () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
  });

  it("updates and returns id when article exists and belongs to author", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: ARTICLE_ID }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await updateArticle(ARTICLE_ID, AUTHOR_ID, { title: "Updated Title" });

    expect(result).toEqual({ id: ARTICLE_ID });
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns null when article not found or not owned", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await updateArticle(ARTICLE_ID, AUTHOR_ID, { title: "Updated" });
    expect(result).toBeNull();
  });
});

describe("submitArticleForReview", () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
  });

  it("updates status to pending_review and returns id", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: ARTICLE_ID }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await submitArticleForReview(ARTICLE_ID, AUTHOR_ID);

    expect(result).toEqual({ id: ARTICLE_ID });
  });

  it("returns null when article not found", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await submitArticleForReview(ARTICLE_ID, AUTHOR_ID);
    expect(result).toBeNull();
  });
});

describe("countWeeklyArticleSubmissions", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns count of pending/published articles within rolling 7 days", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 1 }]);
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await countWeeklyArticleSubmissions(AUTHOR_ID);
    expect(result).toBe(1);
  });

  it("returns 0 when no articles found", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await countWeeklyArticleSubmissions(AUTHOR_ID);
    expect(result).toBe(0);
  });
});

describe("getArticleForEditing", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns article when found and owned", async () => {
    const article = { id: ARTICLE_ID, authorId: AUTHOR_ID, title: "Test", deletedAt: null };
    const limit = vi.fn().mockResolvedValue([article]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await getArticleForEditing(ARTICLE_ID, AUTHOR_ID);
    expect(result).toEqual(article);
  });

  it("returns null when article not found", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await getArticleForEditing(ARTICLE_ID, AUTHOR_ID);
    expect(result).toBeNull();
  });
});

describe("upsertArticleTags", () => {
  beforeEach(() => {
    mockDbTransaction.mockReset();
    mockDbDelete.mockReset();
    mockDbInsert.mockReset();
  });

  it("deletes existing tags and inserts new ones in a transaction", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteFrom = vi.fn().mockReturnValue({ where: deleteWhere });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const insertInto = vi.fn().mockReturnValue({ values: insertValues });

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        delete: () => ({ where: deleteWhere }),
        insert: () => ({ values: insertValues }),
      };
      await fn(tx);
    });

    await upsertArticleTags(ARTICLE_ID, ["igbo", "culture"]);

    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    void deleteFrom; // suppress unused warning
    void insertInto;
  });

  it("skips insert when tags array is empty", async () => {
    let insertCalled = false;
    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
        insert: () => {
          insertCalled = true;
          return { values: vi.fn().mockResolvedValue(undefined) };
        },
      };
      await fn(tx);
    });

    await upsertArticleTags(ARTICLE_ID, []);
    expect(insertCalled).toBe(false);
  });
});

// ─── Admin query tests ────────────────────────────────────────────────────────

describe("listPendingArticles", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns paginated pending articles with total", async () => {
    const items = [
      { id: ARTICLE_ID, title: "Test", authorId: AUTHOR_ID, status: "pending_review" },
    ];
    // First call: items query (leftJoin chain); second call: count query
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // items select chain: .from().leftJoin().where().orderBy().limit().offset()
        const offset = vi.fn().mockResolvedValue(items);
        const limit = vi.fn().mockReturnValue({ offset });
        const orderBy = vi.fn().mockReturnValue({ limit });
        const where = vi.fn().mockReturnValue({ orderBy });
        const leftJoin = vi.fn().mockReturnValue({ where });
        const from = vi.fn().mockReturnValue({ leftJoin });
        return { from };
      } else {
        // count select chain: .from().where()
        const where = vi.fn().mockResolvedValue([{ total: 1 }]);
        const from = vi.fn().mockReturnValue({ where });
        return { from };
      }
    });

    const result = await listPendingArticles({ page: 1, pageSize: 20 });
    expect(result.items).toEqual(items);
    expect(result.total).toBe(1);
  });

  it("returns empty items and zero total when no pending articles", async () => {
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

    const result = await listPendingArticles();
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("listPublishedArticles", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns paginated published articles", async () => {
    const items = [{ id: ARTICLE_ID, title: "Test", authorId: AUTHOR_ID, status: "published" }];
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const offset = vi.fn().mockResolvedValue(items);
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

    const result = await listPublishedArticles({ page: 1, pageSize: 20 });
    expect(result.items).toEqual(items);
    expect(result.total).toBe(1);
  });
});

describe("getArticleByIdForAdmin", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns article when found", async () => {
    const article = { id: ARTICLE_ID, title: "Test", status: "pending_review" };
    const limit = vi.fn().mockResolvedValue([article]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await getArticleByIdForAdmin(ARTICLE_ID);
    expect(result).toEqual(article);
  });

  it("returns null when article not found", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await getArticleByIdForAdmin(ARTICLE_ID);
    expect(result).toBeNull();
  });
});

describe("publishArticleById", () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
  });

  it("updates status to published and returns id, authorId, title, slug", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: ARTICLE_ID, authorId: AUTHOR_ID, title: "Test", slug: "test-abc123" },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await publishArticleById(ARTICLE_ID);
    expect(result).toEqual({
      id: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "Test",
      slug: "test-abc123",
    });
  });

  it("returns null when article not in pending_review", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await publishArticleById(ARTICLE_ID);
    expect(result).toBeNull();
  });
});

describe("rejectArticleById", () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
  });

  it("updates status to rejected with feedback and returns id, authorId, title", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: ARTICLE_ID, authorId: AUTHOR_ID, title: "Test" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await rejectArticleById(ARTICLE_ID, "Needs more detail");
    expect(result).toEqual({ id: ARTICLE_ID, authorId: AUTHOR_ID, title: "Test" });
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns null when article not in pending_review", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await rejectArticleById(ARTICLE_ID, "Feedback");
    expect(result).toBeNull();
  });
});

describe("requestRevisionById", () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
  });

  it("updates status to revision_requested and returns id, authorId, title", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: ARTICLE_ID, authorId: AUTHOR_ID, title: "Test" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await requestRevisionById(ARTICLE_ID, "Please add more detail");
    expect(result).toEqual({ id: ARTICLE_ID, authorId: AUTHOR_ID, title: "Test" });
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns null when article not in pending_review", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await requestRevisionById(ARTICLE_ID, "Feedback");
    expect(result).toBeNull();
  });
});

describe("toggleArticleFeature", () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
  });

  it("sets isFeatured = true and returns id when article is published", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: ARTICLE_ID }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await toggleArticleFeature(ARTICLE_ID, true);
    expect(result).toEqual({ id: ARTICLE_ID });
  });

  it("returns null when article is not published", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const result = await toggleArticleFeature(ARTICLE_ID, true);
    expect(result).toBeNull();
  });
});

describe("incrementArticleViewCount", () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
  });

  it("calls UPDATE on community_articles to increment view_count", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    await incrementArticleViewCount(ARTICLE_ID);

    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

describe("getRelatedArticles", () => {
  beforeEach(() => {
    mockDbExecute.mockReset();
    mockDbSelect.mockReset();
  });

  it("uses db.execute when tags are provided and returns mapped results", async () => {
    const rawRows = [
      {
        id: "rel-1",
        title: "Related",
        slug: "related",
        cover_image_url: null,
        reading_time_minutes: 3,
        author_name: "Author",
      },
    ];
    mockDbExecute.mockResolvedValue(rawRows);

    const result = await getRelatedArticles(ARTICLE_ID, AUTHOR_ID, ["igbo", "culture"]);

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "rel-1",
      title: "Related",
      slug: "related",
      coverImageUrl: null,
      readingTimeMinutes: 3,
      authorName: "Author",
    });
  });

  it("uses db.select when tags array is empty (author-only fallback)", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    mockDbSelect.mockReturnValue({ from });

    const result = await getRelatedArticles(ARTICLE_ID, AUTHOR_ID, []);

    expect(mockDbExecute).not.toHaveBeenCalled();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it("returns empty array when db.execute returns no rows", async () => {
    mockDbExecute.mockResolvedValue([]);

    const result = await getRelatedArticles(ARTICLE_ID, AUTHOR_ID, ["igbo"]);
    expect(result).toEqual([]);
  });
});

describe("getArticleTagsById", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns array of tag strings for the given article", async () => {
    const mockRows = [{ tag: "igbo" }, { tag: "culture" }];
    const where = vi.fn().mockResolvedValue(mockRows);
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await getArticleTagsById(ARTICLE_ID);
    expect(result).toEqual(["igbo", "culture"]);
  });

  it("returns empty array when article has no tags", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await getArticleTagsById(ARTICLE_ID);
    expect(result).toEqual([]);
  });
});

describe("listArticlesByAuthor", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns articles for the given author ordered by updatedAt desc", async () => {
    const articles = [
      { id: ARTICLE_ID, title: "My Article", status: "draft", updatedAt: new Date() },
    ];
    const orderBy = vi.fn().mockResolvedValue(articles);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await listArticlesByAuthor(AUTHOR_ID);
    expect(result).toEqual(articles);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when author has no articles", async () => {
    const orderBy = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const result = await listArticlesByAuthor(AUTHOR_ID);
    expect(result).toEqual([]);
  });
});
