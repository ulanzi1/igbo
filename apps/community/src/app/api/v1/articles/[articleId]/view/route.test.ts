// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIncrementArticleViewCount = vi.fn();

vi.mock("@/db/queries/articles", () => ({
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  submitArticleForReview: vi.fn(),
  countWeeklyArticleSubmissions: vi.fn(),
  upsertArticleTags: vi.fn(),
  getArticleForEditing: vi.fn(),
  listPendingArticles: vi.fn(),
  getArticleByIdForAdmin: vi.fn(),
  publishArticleById: vi.fn(),
  rejectArticleById: vi.fn(),
  toggleArticleFeature: vi.fn(),
  listPublishedArticles: vi.fn(),
  listPublishedArticlesPublic: vi.fn(),
  getPublishedArticleBySlug: vi.fn(),
  incrementArticleViewCount: (...args: unknown[]) => mockIncrementArticleViewCount(...args),
  getRelatedArticles: vi.fn(),
  getArticleTagsById: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";

const ARTICLE_ID = "00000000-0000-4000-8000-000000000002";
const BASE_URL = `https://localhost:3000/api/v1/articles/${ARTICLE_ID}/view`;
const CSRF_HEADERS = {
  Host: "localhost:3000",
  Origin: "https://localhost:3000",
};

beforeEach(() => {
  mockIncrementArticleViewCount.mockReset();
  mockIncrementArticleViewCount.mockResolvedValue(undefined);
});

describe("POST /api/v1/articles/[articleId]/view", () => {
  it("returns 200 with ok:true when view count is incremented", async () => {
    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
    expect(mockIncrementArticleViewCount).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it("returns 200 even when DB update fails (error is swallowed)", async () => {
    mockIncrementArticleViewCount.mockRejectedValue(new Error("DB error"));

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
  });

  it("does not require authentication (unauthenticated request returns 200)", async () => {
    // No session mock needed — route has no auth requirement
    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { Host: "localhost:3000", Origin: "https://localhost:3000" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
