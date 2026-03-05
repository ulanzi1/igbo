// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetArticlePreview = vi.fn();

vi.mock("@/services/article-review-service", () => ({
  getArticlePreview: (...args: unknown[]) => mockGetArticlePreview(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

const ARTICLE_ID = "article-uuid-1";

function makeGetRequest() {
  return new Request(`https://localhost:3000/api/v1/admin/articles/${ARTICLE_ID}`, {
    headers: { Host: "localhost:3000" },
  });
}

beforeEach(() => {
  mockGetArticlePreview.mockReset();
});

describe("GET /api/v1/admin/articles/[articleId]", () => {
  it("returns article data for admin preview", async () => {
    const article = { id: ARTICLE_ID, title: "Test Article", status: "pending_review" };
    mockGetArticlePreview.mockResolvedValue(article);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(ARTICLE_ID);
  });

  it("returns 401 when not admin", async () => {
    mockGetArticlePreview.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 when article not found", async () => {
    mockGetArticlePreview.mockRejectedValue(new ApiError({ status: 404, title: "Not Found" }));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
  });
});
