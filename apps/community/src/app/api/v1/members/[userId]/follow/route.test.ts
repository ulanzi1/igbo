// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockFollowUser = vi.fn();
const mockUnfollowUser = vi.fn();
const mockIsUserFollowing = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/follow-service", () => ({
  followUser: (...args: unknown[]) => mockFollowUser(...args),
  unfollowUser: (...args: unknown[]) => mockUnfollowUser(...args),
  isUserFollowing: (...args: unknown[]) => mockIsUserFollowing(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    MEMBER_FOLLOW: { maxRequests: 30, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Date.now() + 60_000,
    limit: 30,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST, DELETE, GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_ID = "00000000-0000-4000-8000-000000000002";

function makeRequest(method: string) {
  return new Request(`https://example.com/api/v1/members/${TARGET_ID}/follow`, {
    method,
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

function makeGetRequest() {
  return new Request(`https://example.com/api/v1/members/${TARGET_ID}/follow`, {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockFollowUser.mockResolvedValue(undefined);
  mockUnfollowUser.mockResolvedValue(undefined);
  mockIsUserFollowing.mockResolvedValue(false);
});

describe("POST /api/v1/members/[userId]/follow", () => {
  it("returns 200 { ok: true } on success", async () => {
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(mockFollowUser).toHaveBeenCalledWith(USER_ID, TARGET_ID);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new (await import("@/lib/api-error")).ApiError({ status: 401, title: "Unauthorized" }),
    );
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when following yourself", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: TARGET_ID, role: "MEMBER" });
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/yourself/);
  });

  it("returns 400 when targetUserId is not a valid UUID", async () => {
    const req = new Request("https://example.com/api/v1/members/not-a-uuid/follow", {
      method: "POST",
      headers: { Host: "example.com", Origin: "https://example.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("requires Origin header matching Host (CSRF)", async () => {
    const req = new Request(`https://example.com/api/v1/members/${TARGET_ID}/follow`, {
      method: "POST",
      headers: { Host: "example.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/v1/members/[userId]/follow", () => {
  it("returns 200 { ok: true } on unfollow", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(mockUnfollowUser).toHaveBeenCalledWith(USER_ID, TARGET_ID);
  });

  it("requires Origin header (CSRF)", async () => {
    const req = new Request(`https://example.com/api/v1/members/${TARGET_ID}/follow`, {
      method: "DELETE",
      headers: { Host: "example.com" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/members/[userId]/follow", () => {
  it("returns 200 { isFollowing: false } when not following", async () => {
    mockIsUserFollowing.mockResolvedValue(false);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isFollowing).toBe(false);
  });

  it("returns 200 { isFollowing: true } when following", async () => {
    mockIsUserFollowing.mockResolvedValue(true);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isFollowing).toBe(true);
  });

  it("does NOT require Origin header (GET is CSRF-exempt)", async () => {
    const res = await GET(makeGetRequest());
    // No Origin header but should still succeed
    expect(res.status).toBe(200);
  });
});
