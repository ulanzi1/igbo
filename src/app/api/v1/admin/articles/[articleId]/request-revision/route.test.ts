// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequestArticleRevision = vi.fn();

vi.mock("@/services/article-review-service", () => ({
  requestArticleRevision: (...args: unknown[]) => mockRequestArticleRevision(...args),
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

function makePostRequest(body?: unknown) {
  return new Request(
    `https://localhost:3000/api/v1/admin/articles/${ARTICLE_ID}/request-revision`,
    {
      method: "POST",
      headers: CSRF_HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
  );
}

beforeEach(() => {
  mockRequestArticleRevision.mockReset();
  mockRequestArticleRevision.mockResolvedValue({ articleId: ARTICLE_ID });
});

describe("POST /api/v1/admin/articles/[articleId]/request-revision", () => {
  it("returns 200 with feedback", async () => {
    const res = await POST(makePostRequest({ feedback: "Please add more detail" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.articleId).toBe(ARTICLE_ID);
    expect(mockRequestArticleRevision).toHaveBeenCalledWith(
      expect.any(Request),
      ARTICLE_ID,
      "Please add more detail",
    );
  });

  it("returns 422 when no feedback provided", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(422);
    expect(mockRequestArticleRevision).not.toHaveBeenCalled();
  });

  it("returns 422 when feedback is empty string", async () => {
    const res = await POST(makePostRequest({ feedback: "" }));
    expect(res.status).toBe(422);
    expect(mockRequestArticleRevision).not.toHaveBeenCalled();
  });

  it("returns 422 when feedback is too long", async () => {
    const res = await POST(makePostRequest({ feedback: "x".repeat(1001) }));
    expect(res.status).toBe(422);
    expect(mockRequestArticleRevision).not.toHaveBeenCalled();
  });

  it("returns 401 when not admin", async () => {
    mockRequestArticleRevision.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );
    const res = await POST(makePostRequest({ feedback: "Needs work" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when article not found", async () => {
    mockRequestArticleRevision.mockRejectedValue(new ApiError({ status: 404, title: "Not Found" }));
    const res = await POST(makePostRequest({ feedback: "Needs work" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when article not in pending_review status", async () => {
    mockRequestArticleRevision.mockRejectedValue(
      new ApiError({
        status: 409,
        title: "Conflict",
        detail: "Article is not in pending_review status",
      }),
    );
    const res = await POST(makePostRequest({ feedback: "Needs work" }));
    expect(res.status).toBe(409);
  });
});
