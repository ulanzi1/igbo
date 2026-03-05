// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFeatureArticle = vi.fn();

vi.mock("@/services/article-review-service", () => ({
  featureArticle: (...args: unknown[]) => mockFeatureArticle(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { PATCH } from "./route";
import { ApiError } from "@/lib/api-error";

const ARTICLE_ID = "article-uuid-1";
const CSRF_HEADERS = {
  Host: "localhost:3000",
  Origin: "https://localhost:3000",
  "Content-Type": "application/json",
};

function makePatchRequest(body: unknown) {
  return new Request(`https://localhost:3000/api/v1/admin/articles/${ARTICLE_ID}/feature`, {
    method: "PATCH",
    headers: CSRF_HEADERS,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockFeatureArticle.mockReset();
});

describe("PATCH /api/v1/admin/articles/[articleId]/feature", () => {
  it("features article (featured=true)", async () => {
    mockFeatureArticle.mockResolvedValue({ articleId: ARTICLE_ID, isFeatured: true });
    const res = await PATCH(makePatchRequest({ featured: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isFeatured).toBe(true);
  });

  it("unfeatures article (featured=false)", async () => {
    mockFeatureArticle.mockResolvedValue({ articleId: ARTICLE_ID, isFeatured: false });
    const res = await PATCH(makePatchRequest({ featured: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isFeatured).toBe(false);
  });

  it("returns 401 when not admin", async () => {
    mockFeatureArticle.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));
    const res = await PATCH(makePatchRequest({ featured: true }));
    expect(res.status).toBe(401);
  });
});
