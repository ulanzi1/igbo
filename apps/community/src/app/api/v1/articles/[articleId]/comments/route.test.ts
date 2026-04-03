// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockAddComment = vi.fn();
const mockListComments = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/article-comment-service", () => ({
  addComment: (...args: unknown[]) => mockAddComment(...args),
  listComments: (...args: unknown[]) => mockListComments(...args),
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

import { GET, POST } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ARTICLE_ID = "00000000-0000-4000-8000-000000000002";
const COMMENT_ID = "00000000-0000-4000-8000-000000000003";

const BASE_URL = `https://localhost:3000/api/v1/articles/${ARTICLE_ID}/comments`;
const CSRF_HEADERS = {
  Host: "localhost:3000",
  Origin: "https://localhost:3000",
  "Content-Type": "application/json",
};

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockAddComment.mockReset();
  mockListComments.mockReset();

  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockListComments.mockResolvedValue({ items: [], total: 0 });
  mockAddComment.mockResolvedValue({ commentId: COMMENT_ID });
});

describe("GET /api/v1/articles/[articleId]/comments", () => {
  it("returns 200 with comment list", async () => {
    const mockItems = [{ id: COMMENT_ID, content: "Nice!" }];
    mockListComments.mockResolvedValue({ items: mockItems, total: 1 });

    const request = new Request(BASE_URL, { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { items: unknown[]; total: number } };
    expect(body.data.items).toEqual(mockItems);
    expect(body.data.total).toBe(1);
  });

  it("returns 200 with pagination params parsed from query string", async () => {
    mockListComments.mockResolvedValue({ items: [], total: 10 });

    const request = new Request(`${BASE_URL}?page=2&pageSize=5`, { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockListComments).toHaveBeenCalledWith(ARTICLE_ID, { page: 2, pageSize: 5 });
  });
});

describe("POST /api/v1/articles/[articleId]/comments", () => {
  it("returns 201 with commentId on success", async () => {
    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ content: "Great article!" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { commentId: string } };
    expect(body.data.commentId).toBe(COMMENT_ID);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ content: "Test" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 422 when content is empty", async () => {
    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ content: "" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 422 when content exceeds 2000 characters", async () => {
    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ content: "a".repeat(2001) }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 404 when service throws 404 (article not found)", async () => {
    mockAddComment.mockRejectedValue(new ApiError({ title: "Not Found", status: 404 }));

    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ content: "Test comment" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("includes parentCommentId when provided", async () => {
    const parentId = "00000000-0000-4000-8000-000000000099";
    const request = new Request(BASE_URL, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ content: "Reply comment", parentCommentId: parentId }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockAddComment).toHaveBeenCalledWith(USER_ID, ARTICLE_ID, "Reply comment", parentId);
  });
});
