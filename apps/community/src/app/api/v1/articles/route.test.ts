// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockCanPublishArticle = vi.fn();
const mockSaveDraft = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
  canPublishArticle: (...args: unknown[]) => mockCanPublishArticle(...args),
}));

vi.mock("@/services/article-service", () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    POST_CREATE: { maxRequests: 5, windowMs: 60_000 },
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

const validBody = {
  title: "My Igbo Culture Article",
  content:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}',
  category: "discussion",
  visibility: "members_only",
};

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockCanPublishArticle.mockReset();
  mockSaveDraft.mockReset();

  mockRequireAuthenticatedSession.mockResolvedValue({ userId: AUTHOR_ID, role: "MEMBER" });
  mockCanPublishArticle.mockResolvedValue({ allowed: true });
  mockSaveDraft.mockResolvedValue({
    articleId: ARTICLE_ID,
    slug: "my-igbo-culture-article-abc123",
  });
});

describe("POST /api/v1/articles", () => {
  it("returns 201 with articleId and slug on success", async () => {
    const request = new Request("https://localhost:3000/api/v1/articles", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { articleId: string; slug: string } };
    expect(body.data.articleId).toBe(ARTICLE_ID);
    expect(body.data.slug).toBe("my-igbo-culture-article-abc123");
  });

  it("returns 403 when user lacks article publish permission", async () => {
    mockCanPublishArticle.mockResolvedValue({
      allowed: false,
      reason: "Articles.permissions.notEligible",
    });

    const request = new Request("https://localhost:3000/api/v1/articles", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns 422 on validation error (missing title)", async () => {
    const request = new Request("https://localhost:3000/api/v1/articles", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        content: validBody.content,
        category: "discussion",
        visibility: "members_only",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const request = new Request("https://localhost:3000/api/v1/articles", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
