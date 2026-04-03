// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockSaveDraft = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/article-service", () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
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

import { PATCH } from "./route";
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
  mockSaveDraft.mockReset();

  mockRequireAuthenticatedSession.mockResolvedValue({ userId: AUTHOR_ID, role: "MEMBER" });
  mockSaveDraft.mockResolvedValue({ articleId: ARTICLE_ID, slug: "test-slug" });
});

describe("PATCH /api/v1/articles/[articleId]", () => {
  it("returns 200 with articleId on successful update", async () => {
    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}`, {
      method: "PATCH",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ title: "Updated Title" }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { articleId: string } };
    expect(body.data.articleId).toBe(ARTICLE_ID);
  });

  it("returns 403 when service throws 403 (not owner)", async () => {
    mockSaveDraft.mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403, detail: "Not owner" }),
    );

    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}`, {
      method: "PATCH",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ title: "Updated" }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(403);
  });

  it("returns 404 when article not found", async () => {
    mockSaveDraft.mockRejectedValue(
      new ApiError({ title: "Not Found", status: 404, detail: "Not found" }),
    );

    const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}`, {
      method: "PATCH",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ title: "Updated" }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(404);
  });
});
