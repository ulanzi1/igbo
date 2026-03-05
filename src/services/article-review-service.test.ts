// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: vi.fn().mockResolvedValue({ adminId: "admin-uuid" }),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn(), on: vi.fn() },
}));

vi.mock("@/db/queries/articles", () => ({
  listPendingArticles: vi.fn(),
  listPublishedArticles: vi.fn(),
  getArticleByIdForAdmin: vi.fn(),
  publishArticleById: vi.fn(),
  rejectArticleById: vi.fn(),
  requestRevisionById: vi.fn(),
  toggleArticleFeature: vi.fn(),
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  submitArticleForReview: vi.fn(),
  countWeeklyArticleSubmissions: vi.fn(),
  upsertArticleTags: vi.fn(),
  getArticleForEditing: vi.fn(),
  listArticlesByAuthor: vi.fn(),
}));

import { requireAdminSession } from "@/lib/admin-auth";
import { eventBus } from "@/services/event-bus";
import {
  listPendingArticles,
  listPublishedArticles,
  getArticleByIdForAdmin,
  publishArticleById,
  rejectArticleById,
  requestRevisionById,
  toggleArticleFeature,
} from "@/db/queries/articles";
import {
  listPendingArticlesForAdmin,
  listPublishedArticlesForAdmin,
  approveArticle,
  rejectArticle,
  requestArticleRevision,
  featureArticle,
  getArticlePreview,
} from "./article-review-service";

const mockRequireAdminSession = requireAdminSession as ReturnType<typeof vi.fn>;
const mockListPendingArticles = listPendingArticles as ReturnType<typeof vi.fn>;
const mockListPublishedArticles = listPublishedArticles as ReturnType<typeof vi.fn>;
const mockGetArticleByIdForAdmin = getArticleByIdForAdmin as ReturnType<typeof vi.fn>;
const mockPublishArticleById = publishArticleById as ReturnType<typeof vi.fn>;
const mockRejectArticleById = rejectArticleById as ReturnType<typeof vi.fn>;
const mockRequestRevisionById = requestRevisionById as ReturnType<typeof vi.fn>;
const mockToggleArticleFeature = toggleArticleFeature as ReturnType<typeof vi.fn>;
const mockEventBusEmit = eventBus.emit as ReturnType<typeof vi.fn>;

const ADMIN_ID = "admin-uuid";
const ARTICLE_ID = "article-uuid-1";
const AUTHOR_ID = "author-uuid-1";

function makeRequest() {
  return new Request("https://localhost:3000/api/v1/admin/articles");
}

beforeEach(() => {
  mockRequireAdminSession.mockReset();
  mockListPendingArticles.mockReset();
  mockListPublishedArticles.mockReset();
  mockGetArticleByIdForAdmin.mockReset();
  mockPublishArticleById.mockReset();
  mockRejectArticleById.mockReset();
  mockRequestRevisionById.mockReset();
  mockToggleArticleFeature.mockReset();
  mockEventBusEmit.mockReset();

  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockEventBusEmit.mockResolvedValue(undefined);
});

describe("listPendingArticlesForAdmin", () => {
  it("calls requireAdminSession and returns pending articles", async () => {
    const mockResult = { items: [], total: 0 };
    mockListPendingArticles.mockResolvedValue(mockResult);

    const result = await listPendingArticlesForAdmin(makeRequest());
    expect(mockRequireAdminSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResult);
  });

  it("throws 401 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    await expect(listPendingArticlesForAdmin(makeRequest())).rejects.toThrow();
  });
});

describe("listPublishedArticlesForAdmin", () => {
  it("calls requireAdminSession and returns published articles", async () => {
    const mockResult = { items: [], total: 0 };
    mockListPublishedArticles.mockResolvedValue(mockResult);

    const result = await listPublishedArticlesForAdmin(makeRequest());
    expect(result).toEqual(mockResult);
  });
});

describe("approveArticle", () => {
  it("publishes article and emits article.published event", async () => {
    mockPublishArticleById.mockResolvedValue({
      id: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "Test Article",
      slug: "test-article-abc123",
    });

    const result = await approveArticle(makeRequest(), ARTICLE_ID);

    expect(result).toEqual({ articleId: ARTICLE_ID });
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "article.published",
      expect.objectContaining({
        articleId: ARTICLE_ID,
        authorId: AUTHOR_ID,
        title: "Test Article",
        slug: "test-article-abc123",
      }),
    );
  });

  it("throws 404 when article not found", async () => {
    mockPublishArticleById.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue(null);

    await expect(approveArticle(makeRequest(), ARTICLE_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when article not in pending_review", async () => {
    mockPublishArticleById.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue({ id: ARTICLE_ID, status: "published" });

    await expect(approveArticle(makeRequest(), ARTICLE_ID)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 401 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    await expect(approveArticle(makeRequest(), ARTICLE_ID)).rejects.toThrow();
  });
});

describe("rejectArticle", () => {
  it("rejects article with feedback and emits article.rejected event", async () => {
    mockRejectArticleById.mockResolvedValue({
      id: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "Test Article",
    });

    const result = await rejectArticle(makeRequest(), ARTICLE_ID, "Needs more detail");

    expect(result).toEqual({ articleId: ARTICLE_ID });
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "article.rejected",
      expect.objectContaining({
        articleId: ARTICLE_ID,
        authorId: AUTHOR_ID,
        feedback: "Needs more detail",
      }),
    );
  });

  it("throws 404 when article not found", async () => {
    mockRejectArticleById.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue(null);

    await expect(rejectArticle(makeRequest(), ARTICLE_ID, "Feedback")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when article not in pending_review", async () => {
    mockRejectArticleById.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue({ id: ARTICLE_ID, status: "published" });

    await expect(rejectArticle(makeRequest(), ARTICLE_ID, "Feedback")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("featureArticle", () => {
  it("features a published article", async () => {
    mockToggleArticleFeature.mockResolvedValue({ id: ARTICLE_ID });

    const result = await featureArticle(makeRequest(), ARTICLE_ID, true);
    expect(result).toEqual({ articleId: ARTICLE_ID, isFeatured: true });
  });

  it("unfeatures a published article", async () => {
    mockToggleArticleFeature.mockResolvedValue({ id: ARTICLE_ID });

    const result = await featureArticle(makeRequest(), ARTICLE_ID, false);
    expect(result).toEqual({ articleId: ARTICLE_ID, isFeatured: false });
  });

  it("throws 404 when article not found", async () => {
    mockToggleArticleFeature.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue(null);

    await expect(featureArticle(makeRequest(), ARTICLE_ID, true)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when article is not published", async () => {
    mockToggleArticleFeature.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue({ id: ARTICLE_ID, status: "pending_review" });

    await expect(featureArticle(makeRequest(), ARTICLE_ID, true)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("requestArticleRevision", () => {
  it("requests revision and emits article.revision_requested event", async () => {
    mockRequestRevisionById.mockResolvedValue({
      id: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "Test Article",
    });

    const result = await requestArticleRevision(
      makeRequest(),
      ARTICLE_ID,
      "Please add more detail",
    );

    expect(result).toEqual({ articleId: ARTICLE_ID });
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "article.revision_requested",
      expect.objectContaining({
        articleId: ARTICLE_ID,
        authorId: AUTHOR_ID,
        title: "Test Article",
        feedback: "Please add more detail",
      }),
    );
  });

  it("throws 404 when article not found", async () => {
    mockRequestRevisionById.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue(null);

    await expect(
      requestArticleRevision(makeRequest(), ARTICLE_ID, "Feedback"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when article not in pending_review", async () => {
    mockRequestRevisionById.mockResolvedValue(null);
    mockGetArticleByIdForAdmin.mockResolvedValue({ id: ARTICLE_ID, status: "draft" });

    await expect(
      requestArticleRevision(makeRequest(), ARTICLE_ID, "Feedback"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 401 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    await expect(requestArticleRevision(makeRequest(), ARTICLE_ID, "Feedback")).rejects.toThrow();
  });
});

describe("getArticlePreview", () => {
  it("returns article for admin preview", async () => {
    const article = { id: ARTICLE_ID, title: "Test", status: "pending_review" };
    mockGetArticleByIdForAdmin.mockResolvedValue(article);

    const result = await getArticlePreview(makeRequest(), ARTICLE_ID);
    expect(result).toEqual(article);
  });

  it("throws 404 when article not found", async () => {
    mockGetArticleByIdForAdmin.mockResolvedValue(null);

    await expect(getArticlePreview(makeRequest(), ARTICLE_ID)).rejects.toMatchObject({
      status: 404,
    });
  });
});
