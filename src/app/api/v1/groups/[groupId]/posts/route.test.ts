// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetGroupMember = vi.fn();
const mockGetGroupFeedPosts = vi.fn();
const mockCreateGroupPost = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/groups", () => ({
  getGroupMember: (...args: unknown[]) => mockGetGroupMember(...args),
}));

vi.mock("@/db/queries/feed", () => ({
  getGroupFeedPosts: (...args: unknown[]) => mockGetGroupFeedPosts(...args),
}));

vi.mock("@/services/post-service", () => ({
  createGroupPost: (...args: unknown[]) => mockCreateGroupPost(...args),
}));

const mockListPendingGroupPosts = vi.fn();
vi.mock("@/db/queries/posts", () => ({
  listPendingGroupPosts: (...args: unknown[]) => mockListPendingGroupPosts(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    FEED_READ: { maxRequests: 60, windowMs: 60_000 },
    POST_CREATE: { maxRequests: 10, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000, limit: 10 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET, POST } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const POST_ID = "00000000-0000-4000-8000-000000000004";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/posts`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockGetGroupMember.mockReset();
  mockGetGroupFeedPosts.mockReset();
  mockCreateGroupPost.mockReset();
  mockListPendingGroupPosts.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("GET /api/v1/groups/[groupId]/posts", () => {
  it("returns 200 with posts for active member", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockGetGroupFeedPosts.mockResolvedValue({ posts: [], nextCursor: null });

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ posts: [], nextCursor: null });
  });

  it("returns 403 for non-member", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 403 for pending member", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "pending" });

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns pending posts for leader with ?pending=true", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockListPendingGroupPosts.mockResolvedValue({
      posts: [{ id: POST_ID, content: "Pending" }],
      nextCursor: null,
    });

    const req = new Request(`${BASE_URL}?pending=true`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.posts).toHaveLength(1);
  });

  it("forwards cursor and limit params to listPendingGroupPosts", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockListPendingGroupPosts.mockResolvedValue({ posts: [], nextCursor: null });

    const req = new Request(`${BASE_URL}?pending=true&cursor=2026-03-01T10%3A00%3A00.000Z&limit=5`);
    await GET(req);

    expect(mockListPendingGroupPosts).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ cursor: "2026-03-01T10:00:00.000Z", limit: 5 }),
    );
  });

  it("returns nextCursor in response when more pending posts exist", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });
    mockListPendingGroupPosts.mockResolvedValue({
      posts: [{ id: POST_ID, content: "Pending" }],
      nextCursor: "2026-03-01T12:00:00.000Z",
    });

    const req = new Request(`${BASE_URL}?pending=true`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nextCursor).toBe("2026-03-01T12:00:00.000Z");
  });

  it("caps limit at 20 even if larger value is provided", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
    mockListPendingGroupPosts.mockResolvedValue({ posts: [], nextCursor: null });

    const req = new Request(`${BASE_URL}?pending=true&limit=100`);
    await GET(req);

    expect(mockListPendingGroupPosts).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ limit: 20 }),
    );
  });

  it("returns 403 for member requesting ?pending=true", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const req = new Request(`${BASE_URL}?pending=true`);
    const res = await GET(req);

    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/groups/[groupId]/posts", () => {
  const validBody = {
    content: "Hello group!",
    contentType: "text",
    category: "discussion",
  };

  it("returns 201 on successful group post creation with active status", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockCreateGroupPost.mockResolvedValue({ success: true, postId: POST_ID, status: "active" });

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.postId).toBe(POST_ID);
    expect(body.data.status).toBe("active");
  });

  it("returns 201 with pending_approval status in moderated group", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockCreateGroupPost.mockResolvedValue({
      success: true,
      postId: POST_ID,
      status: "pending_approval",
    });

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe("pending_approval");
  });

  it("returns 403 for non-member trying to post", async () => {
    mockGetGroupMember.mockResolvedValue(null);

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 403 when posting permission denied by service", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });
    mockCreateGroupPost.mockResolvedValue({ success: false, reason: "Only leaders can post" });

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid body", async () => {
    mockGetGroupMember.mockResolvedValue({ role: "member", status: "active" });

    const req = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
      body: JSON.stringify({ content: "Missing required fields" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });
});
