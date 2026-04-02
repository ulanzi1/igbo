// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const mockAddArticleComment = vi.fn();
const mockListArticleComments = vi.fn();

vi.mock("@igbo/db/queries/article-comments", () => ({
  addArticleComment: (...args: unknown[]) => mockAddArticleComment(...args),
  listArticleComments: (...args: unknown[]) => mockListArticleComments(...args),
}));

const mockGetArticleByIdForAdmin = vi.fn();

vi.mock("@igbo/db/queries/articles", () => ({
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  submitArticleForReview: vi.fn(),
  countWeeklyArticleSubmissions: vi.fn(),
  upsertArticleTags: vi.fn(),
  getArticleForEditing: vi.fn(),
  listPendingArticles: vi.fn(),
  getArticleByIdForAdmin: (...args: unknown[]) => mockGetArticleByIdForAdmin(...args),
  publishArticleById: vi.fn(),
  rejectArticleById: vi.fn(),
  toggleArticleFeature: vi.fn(),
  listPublishedArticles: vi.fn(),
  listPublishedArticlesPublic: vi.fn(),
  getPublishedArticleBySlug: vi.fn(),
  incrementArticleViewCount: vi.fn(),
  getRelatedArticles: vi.fn(),
  getArticleTagsById: vi.fn(),
}));

const mockEventBusEmit = vi.fn();

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: (...args: unknown[]) => mockEventBusEmit(...args), on: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { addComment, listComments } from "./article-comment-service";
import { ApiError } from "@/lib/api-error";

const ARTICLE_ID = "article-uuid-1";
const COMMENT_ID = "comment-uuid-1";
const USER_ID = "user-uuid-1";

const PUBLISHED_ARTICLE = {
  id: ARTICLE_ID,
  title: "Test Article",
  status: "published" as const,
  authorId: USER_ID,
};

describe("addComment", () => {
  beforeEach(() => {
    mockAddArticleComment.mockReset();
    mockGetArticleByIdForAdmin.mockReset();
    mockEventBusEmit.mockReset();

    mockGetArticleByIdForAdmin.mockResolvedValue(PUBLISHED_ARTICLE);
    mockAddArticleComment.mockResolvedValue({
      id: COMMENT_ID,
      articleId: ARTICLE_ID,
      authorId: USER_ID,
      content: "Great article!",
      createdAt: new Date(),
    });
    mockEventBusEmit.mockResolvedValue(undefined);
  });

  it("successfully adds a comment and emits article.commented event", async () => {
    const result = await addComment(USER_ID, ARTICLE_ID, "Great article!");

    expect(result).toEqual({ commentId: COMMENT_ID });
    expect(mockAddArticleComment).toHaveBeenCalledWith({
      articleId: ARTICLE_ID,
      authorId: USER_ID,
      content: "Great article!",
      parentCommentId: null,
    });
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "article.commented",
      expect.objectContaining({
        articleId: ARTICLE_ID,
        commentId: COMMENT_ID,
        userId: USER_ID,
      }),
    );
  });

  it("throws 404 when article is not found", async () => {
    mockGetArticleByIdForAdmin.mockResolvedValue(null);

    await expect(addComment(USER_ID, ARTICLE_ID, "Test")).rejects.toThrow(ApiError);
    await expect(addComment(USER_ID, ARTICLE_ID, "Test")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when article is not published", async () => {
    mockGetArticleByIdForAdmin.mockResolvedValue({
      ...PUBLISHED_ARTICLE,
      status: "pending_review",
    });

    await expect(addComment(USER_ID, ARTICLE_ID, "Test")).rejects.toThrow(ApiError);
    await expect(addComment(USER_ID, ARTICLE_ID, "Test")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 422 when content is empty", async () => {
    await expect(addComment(USER_ID, ARTICLE_ID, "   ")).rejects.toThrow(ApiError);
    await expect(addComment(USER_ID, ARTICLE_ID, "   ")).rejects.toMatchObject({ status: 422 });
  });

  it("throws 422 when content exceeds 2000 characters", async () => {
    const longContent = "a".repeat(2001);

    await expect(addComment(USER_ID, ARTICLE_ID, longContent)).rejects.toThrow(ApiError);
    await expect(addComment(USER_ID, ARTICLE_ID, longContent)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("throws 401 when userId is empty", async () => {
    await expect(addComment("", ARTICLE_ID, "Test")).rejects.toThrow(ApiError);
    await expect(addComment("", ARTICLE_ID, "Test")).rejects.toMatchObject({ status: 401 });
  });

  it("passes parentCommentId when provided", async () => {
    const parentId = "parent-comment-uuid";
    await addComment(USER_ID, ARTICLE_ID, "Reply", parentId);

    expect(mockAddArticleComment).toHaveBeenCalledWith(
      expect.objectContaining({ parentCommentId: parentId }),
    );
  });
});

describe("listComments", () => {
  beforeEach(() => {
    mockListArticleComments.mockReset();
  });

  it("delegates to listArticleComments with options", async () => {
    const mockResult = { items: [], total: 0 };
    mockListArticleComments.mockResolvedValue(mockResult);

    const result = await listComments(ARTICLE_ID, { page: 2, pageSize: 10 });

    expect(result).toEqual(mockResult);
    expect(mockListArticleComments).toHaveBeenCalledWith(ARTICLE_ID, { page: 2, pageSize: 10 });
  });

  it("returns paginated comments from the query", async () => {
    const mockResult = {
      items: [
        {
          id: COMMENT_ID,
          articleId: ARTICLE_ID,
          authorId: USER_ID,
          authorName: "Test User",
          authorPhotoUrl: null,
          content: "Nice article!",
          parentCommentId: null,
          createdAt: new Date(),
        },
      ],
      total: 1,
    };
    mockListArticleComments.mockResolvedValue(mockResult);

    const result = await listComments(ARTICLE_ID);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
