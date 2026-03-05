// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockApproveArticle = vi.fn();

vi.mock("@/services/article-review-service", () => ({
  approveArticle: (...args: unknown[]) => mockApproveArticle(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const ARTICLE_ID = "article-uuid-1";
const CSRF_HEADERS = {
  Host: "localhost:3000",
  Origin: "https://localhost:3000",
  "Content-Type": "application/json",
};

function makePostRequest() {
  return new Request(`https://localhost:3000/api/v1/admin/articles/${ARTICLE_ID}/publish`, {
    method: "POST",
    headers: CSRF_HEADERS,
  });
}

beforeEach(() => {
  mockApproveArticle.mockReset();
  mockApproveArticle.mockResolvedValue({ articleId: ARTICLE_ID });
});

describe("POST /api/v1/admin/articles/[articleId]/publish", () => {
  it("returns 200 with articleId on success", async () => {
    const res = await POST(makePostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.articleId).toBe(ARTICLE_ID);
  });

  it("returns 401 when not admin", async () => {
    mockApproveArticle.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 when article not found", async () => {
    mockApproveArticle.mockRejectedValue(new ApiError({ status: 404, title: "Not Found" }));
    const res = await POST(makePostRequest());
    expect(res.status).toBe(404);
  });
});
