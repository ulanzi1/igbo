// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));
vi.mock("@/services/bookmark-service", () => ({
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}));
vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    POST_BOOKMARK: { maxRequests: 30, windowMs: 60_000 },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, limit: 30 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST, DELETE } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import { addBookmark, removeBookmark } from "@/services/bookmark-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockAddBookmark = vi.mocked(addBookmark);
const mockRemoveBookmark = vi.mocked(removeBookmark);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";
const BASE_URL = "http://localhost";

function makeRequest(method: string, postId: string) {
  return new Request(`${BASE_URL}/api/v1/posts/${postId}/bookmarks`, {
    method,
    headers: { Origin: BASE_URL, Host: "localhost" },
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockAddBookmark.mockReset();
  mockRemoveBookmark.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
});

describe("POST /api/v1/posts/[postId]/bookmarks", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await POST(makeRequest("POST", POST_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid postId", async () => {
    const res = await POST(makeRequest("POST", "not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("calls addBookmark and returns { bookmarked: true }", async () => {
    mockAddBookmark.mockResolvedValueOnce({ bookmarked: true });

    const res = await POST(makeRequest("POST", POST_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ bookmarked: true });
    expect(mockAddBookmark).toHaveBeenCalledWith("user-1", POST_ID);
  });
});

describe("DELETE /api/v1/posts/[postId]/bookmarks", () => {
  it("calls removeBookmark and returns { bookmarked: false }", async () => {
    mockRemoveBookmark.mockResolvedValueOnce({ bookmarked: false });

    const res = await DELETE(makeRequest("DELETE", POST_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ bookmarked: false });
    expect(mockRemoveBookmark).toHaveBeenCalledWith("user-1", POST_ID);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await DELETE(makeRequest("DELETE", POST_ID));
    expect(res.status).toBe(401);
  });
});
