// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api-error";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/db/queries/articles", () => ({
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  submitArticleForReview: vi.fn(),
  countWeeklyArticleSubmissions: vi.fn(),
  upsertArticleTags: vi.fn(),
  getArticleForEditing: vi.fn(),
}));

vi.mock("@/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn(),
}));

vi.mock("@/services/permissions", () => ({
  PERMISSION_MATRIX: {
    BASIC: {
      canPublishArticle: false,
      maxArticlesPerWeek: 0,
      articleVisibility: [],
    },
    PROFESSIONAL: {
      canPublishArticle: true,
      maxArticlesPerWeek: 1,
      articleVisibility: ["MEMBERS_ONLY"],
    },
    TOP_TIER: {
      canPublishArticle: true,
      maxArticlesPerWeek: 2,
      articleVisibility: ["MEMBERS_ONLY", "PUBLIC"],
    },
  },
}));

vi.mock("@/lib/slug", () => ({
  generateSlug: vi.fn().mockReturnValue("test-slug-abc123"),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined) },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  createArticle,
  updateArticle,
  submitArticleForReview,
  countWeeklyArticleSubmissions,
  upsertArticleTags,
  getArticleForEditing,
} from "@/db/queries/articles";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import { eventBus } from "@/services/event-bus";
import { saveDraft, submitArticle, getArticleForEditingService } from "./article-service";

const mockGetTier = vi.mocked(getUserMembershipTier);
const mockCreateArticle = vi.mocked(createArticle);
const mockUpdateArticle = vi.mocked(updateArticle);
const mockSubmitArticleForReview = vi.mocked(submitArticleForReview);
const mockCountWeekly = vi.mocked(countWeeklyArticleSubmissions);
const mockUpsertTags = vi.mocked(upsertArticleTags);
const mockGetArticleForEditing = vi.mocked(getArticleForEditing);
const mockEventBusEmit = vi.mocked(eventBus.emit);

const AUTHOR_ID = "author-uuid-1";
const ARTICLE_ID = "article-uuid-1";

describe("saveDraft — create", () => {
  beforeEach(() => {
    mockGetTier.mockReset();
    mockCreateArticle.mockReset();
    mockUpsertTags.mockReset();
    mockGetArticleForEditing.mockReset();
  });

  it("creates a new draft when tier allows", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCreateArticle.mockResolvedValue({ id: ARTICLE_ID, slug: "test-slug-abc123" });

    const result = await saveDraft(AUTHOR_ID, {
      title: "My Article",
      content:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}',
      category: "discussion",
      visibility: "members_only",
    });

    expect(result).toEqual({ articleId: ARTICLE_ID, slug: "test-slug-abc123" });
    expect(mockCreateArticle).toHaveBeenCalledTimes(1);
  });

  it("throws 403 when Basic tier member tries to create", async () => {
    mockGetTier.mockResolvedValue("BASIC");

    await expect(
      saveDraft(AUTHOR_ID, {
        title: "My Article",
        content: '{"type":"doc","content":[]}',
        category: "discussion",
        visibility: "members_only",
      }),
    ).rejects.toThrow(ApiError);

    const err = await saveDraft(AUTHOR_ID, {
      title: "My Article",
      content: '{"type":"doc","content":[]}',
      category: "discussion",
      visibility: "members_only",
    }).catch((e: ApiError) => e);

    expect((err as ApiError).status).toBe(403);
  });

  it("upserts tags when provided", async () => {
    mockGetTier.mockResolvedValue("TOP_TIER");
    mockCreateArticle.mockResolvedValue({ id: ARTICLE_ID, slug: "test-slug-abc123" });
    mockUpsertTags.mockResolvedValue(undefined);

    await saveDraft(AUTHOR_ID, {
      title: "My Article",
      content: '{"type":"doc","content":[]}',
      category: "discussion",
      visibility: "members_only",
      tags: ["igbo", "culture"],
    });

    expect(mockUpsertTags).toHaveBeenCalledWith(ARTICLE_ID, ["igbo", "culture"]);
  });

  it("limits tags to 10", async () => {
    mockGetTier.mockResolvedValue("TOP_TIER");
    mockCreateArticle.mockResolvedValue({ id: ARTICLE_ID, slug: "test-slug-abc123" });
    mockUpsertTags.mockResolvedValue(undefined);

    const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
    await saveDraft(AUTHOR_ID, {
      title: "My Article",
      content: '{"type":"doc","content":[]}',
      category: "discussion",
      visibility: "members_only",
      tags,
    });

    const [, calledTags] = mockUpsertTags.mock.calls[0] as [string, string[]];
    expect(calledTags.length).toBe(10);
  });
});

describe("saveDraft — update", () => {
  beforeEach(() => {
    mockGetTier.mockReset();
    mockUpdateArticle.mockReset();
    mockGetArticleForEditing.mockReset();
    mockUpsertTags.mockReset();
  });

  it("updates an existing draft", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockUpdateArticle.mockResolvedValue({ id: ARTICLE_ID });
    mockGetArticleForEditing.mockResolvedValue({
      id: ARTICLE_ID,
      slug: "existing-slug",
    } as Awaited<ReturnType<typeof getArticleForEditing>>);

    const result = await saveDraft(AUTHOR_ID, {
      articleId: ARTICLE_ID,
      title: "Updated Title",
    });

    expect(result).toEqual({ articleId: ARTICLE_ID, slug: "existing-slug" });
    expect(mockUpdateArticle).toHaveBeenCalledTimes(1);
  });

  it("throws 404 when article not found or not owned", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockUpdateArticle.mockResolvedValue(null);

    await expect(saveDraft(AUTHOR_ID, { articleId: ARTICLE_ID, title: "Updated" })).rejects.toThrow(
      ApiError,
    );
  });
});

describe("submitArticle", () => {
  beforeEach(() => {
    mockGetTier.mockReset();
    mockCountWeekly.mockReset();
    mockSubmitArticleForReview.mockReset();
    mockEventBusEmit.mockReset();
    mockGetArticleForEditing.mockReset();
    mockGetArticleForEditing.mockResolvedValue({
      id: ARTICLE_ID,
      title: "Test Article",
      coverImageUrl: "/uploads/cover.jpg",
      status: "draft",
    } as Awaited<ReturnType<typeof getArticleForEditing>>);
  });

  it("submits successfully when within weekly limit", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCountWeekly.mockResolvedValue(0);
    mockSubmitArticleForReview.mockResolvedValue({ id: ARTICLE_ID });
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await submitArticle(AUTHOR_ID, ARTICLE_ID);

    expect(result).toEqual({ articleId: ARTICLE_ID });
    expect(mockSubmitArticleForReview).toHaveBeenCalledWith(ARTICLE_ID, AUTHOR_ID);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "article.submitted",
      expect.objectContaining({ articleId: ARTICLE_ID, authorId: AUTHOR_ID }),
    );
  });

  it("throws 409 when weekly limit reached for Professional (1/week)", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCountWeekly.mockResolvedValue(1); // already at limit

    await expect(submitArticle(AUTHOR_ID, ARTICLE_ID)).rejects.toThrow(ApiError);

    const err = await submitArticle(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
    expect((err as ApiError).status).toBe(409);
  });

  it("allows Top-tier to submit up to 2 per week", async () => {
    mockGetTier.mockResolvedValue("TOP_TIER");
    mockCountWeekly.mockResolvedValue(1); // 1 already submitted, limit is 2
    mockSubmitArticleForReview.mockResolvedValue({ id: ARTICLE_ID });
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await submitArticle(AUTHOR_ID, ARTICLE_ID);
    expect(result).toEqual({ articleId: ARTICLE_ID });
  });

  it("throws 409 when Top-tier hits their limit of 2", async () => {
    mockGetTier.mockResolvedValue("TOP_TIER");
    mockCountWeekly.mockResolvedValue(2); // at limit

    const err = await submitArticle(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
    expect((err as ApiError).status).toBe(409);
  });

  it("throws 403 when Basic tier tries to submit", async () => {
    mockGetTier.mockResolvedValue("BASIC");

    const err = await submitArticle(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
    expect((err as ApiError).status).toBe(403);
  });

  it("throws 404 when article not found", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCountWeekly.mockResolvedValue(0);
    mockGetArticleForEditing.mockResolvedValue(null);

    const err = await submitArticle(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
    expect((err as ApiError).status).toBe(404);
  });

  it("throws 409 when submitArticleForReview returns null (already pending/published)", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCountWeekly.mockResolvedValue(0);
    mockSubmitArticleForReview.mockResolvedValue(null);
    mockEventBusEmit.mockResolvedValue(undefined);

    const err = await submitArticle(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).detail).toBe("Articles.submit.notEligible");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("submits successfully from revision_requested status", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCountWeekly.mockResolvedValue(0);
    mockGetArticleForEditing.mockResolvedValue({
      id: ARTICLE_ID,
      title: "Revised Article",
      coverImageUrl: "/uploads/cover.jpg",
      status: "revision_requested",
    } as Awaited<ReturnType<typeof getArticleForEditing>>);
    mockSubmitArticleForReview.mockResolvedValue({ id: ARTICLE_ID });
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await submitArticle(AUTHOR_ID, ARTICLE_ID);
    expect(result).toEqual({ articleId: ARTICLE_ID });
    expect(mockSubmitArticleForReview).toHaveBeenCalledWith(ARTICLE_ID, AUTHOR_ID);
  });

  it("throws 422 when coverImageUrl is null", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCountWeekly.mockResolvedValue(0);
    mockGetArticleForEditing.mockResolvedValue({
      id: ARTICLE_ID,
      coverImageUrl: null,
      status: "draft",
    } as Awaited<ReturnType<typeof getArticleForEditing>>);

    const err = await submitArticle(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
    expect((err as ApiError).status).toBe(422);
    expect((err as ApiError).detail).toBe("Articles.meta.coverImageRequired");
    expect(mockSubmitArticleForReview).not.toHaveBeenCalled();
  });

  it("emits article.submitted event with correct payload", async () => {
    mockGetTier.mockResolvedValue("TOP_TIER");
    mockCountWeekly.mockResolvedValue(0);
    mockSubmitArticleForReview.mockResolvedValue({ id: ARTICLE_ID });
    mockEventBusEmit.mockResolvedValue(undefined);

    await submitArticle(AUTHOR_ID, ARTICLE_ID);

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "article.submitted",
      expect.objectContaining({
        articleId: ARTICLE_ID,
        authorId: AUTHOR_ID,
        timestamp: expect.any(String) as unknown,
      }),
    );
  });
});

describe("getArticleForEditingService", () => {
  beforeEach(() => {
    mockGetArticleForEditing.mockReset();
  });

  it("returns article when found and owned", async () => {
    const article = { id: ARTICLE_ID, slug: "test", authorId: AUTHOR_ID } as Awaited<
      ReturnType<typeof getArticleForEditing>
    >;
    mockGetArticleForEditing.mockResolvedValue(article);

    const result = await getArticleForEditingService(AUTHOR_ID, ARTICLE_ID);
    expect(result).toEqual(article);
    expect(mockGetArticleForEditing).toHaveBeenCalledWith(ARTICLE_ID, AUTHOR_ID);
  });

  it("throws 404 when article not found", async () => {
    mockGetArticleForEditing.mockResolvedValue(null);

    const err = await getArticleForEditingService(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
    expect((err as ApiError).status).toBe(404);
  });
});

describe("saveDraft — visibility validation", () => {
  beforeEach(() => {
    mockGetTier.mockReset();
    mockCreateArticle.mockReset();
    mockUpdateArticle.mockReset();
    mockGetArticleForEditing.mockReset();
  });

  it("forces members_only when Professional user requests guest visibility (create)", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockCreateArticle.mockResolvedValue({ id: ARTICLE_ID, slug: "test-slug-abc123" });

    await saveDraft(AUTHOR_ID, {
      title: "My Article",
      content: '{"type":"doc","content":[]}',
      category: "discussion",
      visibility: "guest", // Professional should NOT be allowed guest
    });

    const [createData] = mockCreateArticle.mock.calls[0] as [{ visibility: string }];
    expect(createData.visibility).toBe("members_only");
  });

  it("allows guest visibility for Top-tier user (create)", async () => {
    mockGetTier.mockResolvedValue("TOP_TIER");
    mockCreateArticle.mockResolvedValue({ id: ARTICLE_ID, slug: "test-slug-abc123" });

    await saveDraft(AUTHOR_ID, {
      title: "My Article",
      content: '{"type":"doc","content":[]}',
      category: "discussion",
      visibility: "guest",
    });

    const [createData] = mockCreateArticle.mock.calls[0] as [{ visibility: string }];
    expect(createData.visibility).toBe("guest");
  });

  it("forces members_only when Professional user requests guest visibility (update)", async () => {
    mockGetTier.mockResolvedValue("PROFESSIONAL");
    mockUpdateArticle.mockResolvedValue({ id: ARTICLE_ID });
    mockGetArticleForEditing.mockResolvedValue({
      id: ARTICLE_ID,
      slug: "existing-slug",
    } as Awaited<ReturnType<typeof getArticleForEditing>>);

    await saveDraft(AUTHOR_ID, {
      articleId: ARTICLE_ID,
      visibility: "guest",
    });

    const [, , updateData] = mockUpdateArticle.mock.calls[0] as [
      string,
      string,
      { visibility?: string },
    ];
    expect(updateData.visibility).toBe("members_only");
  });
});
