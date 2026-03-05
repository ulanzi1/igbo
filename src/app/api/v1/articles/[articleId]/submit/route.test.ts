// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockSubmitArticle = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/article-service", () => ({
  submitArticle: (...args: unknown[]) => mockSubmitArticle(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    PROFILE_UPDATE: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const AUTHOR_ID = "00000000-0000-4000-8000-000000000001";
const ARTICLE_ID = "00000000-0000-4000-8000-000000000002";

const CSRF_HEADERS = {
  Host: "localhost:3000",
  Origin: "https://localhost:3000",
  "Content-Type": "application/json",
};

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockSubmitArticle.mockReset();

  mockRequireAuthenticatedSession.mockResolvedValue({ userId: AUTHOR_ID, role: "MEMBER" });
  mockSubmitArticle.mockResolvedValue({ articleId: ARTICLE_ID });
});

describe("POST /api/v1/articles/[articleId]/submit", () => {
  it("returns 200 with articleId and pending_review status on success", async () => {
    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}/submit`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { articleId: string; status: string } };
    expect(body.data.articleId).toBe(ARTICLE_ID);
    expect(body.data.status).toBe("pending_review");
  });

  it("returns 409 when weekly limit reached", async () => {
    mockSubmitArticle.mockRejectedValue(
      new ApiError({
        title: "Conflict",
        status: 409,
        detail: "Articles.permissions.weeklyLimitReached",
      }),
    );

    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}/submit`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it("returns 403 when wrong tier", async () => {
    mockSubmitArticle.mockRejectedValue(
      new ApiError({
        title: "Forbidden",
        status: 403,
        detail: "Articles.permissions.notEligible",
      }),
    );

    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}/submit`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns 404 when article not found", async () => {
    mockSubmitArticle.mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404, detail: "Not found" }),
    );

    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}/submit`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("returns 422 when cover image is missing", async () => {
    mockSubmitArticle.mockRejectedValue(
      new ApiError({
        title: "Unprocessable Entity",
        status: 422,
        detail: "Articles.meta.coverImageRequired",
      }),
    );

    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}/submit`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });
});
