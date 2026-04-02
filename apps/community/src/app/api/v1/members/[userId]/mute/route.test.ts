// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockMuteMember = vi.fn();
const mockUnmuteMember = vi.fn();
const mockIsUserMuted = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/block-service", () => ({
  muteMember: (...args: unknown[]) => mockMuteMember(...args),
  unmuteMember: (...args: unknown[]) => mockUnmuteMember(...args),
  isUserMuted: (...args: unknown[]) => mockIsUserMuted(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    BLOCK_MUTE: { maxRequests: 30, windowMs: 60_000 },
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
  return new Request(`https://example.com/api/v1/members/${TARGET_ID}/mute`, {
    method,
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

function makeGetRequest() {
  return new Request(`https://example.com/api/v1/members/${TARGET_ID}/mute`, {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockMuteMember.mockResolvedValue(undefined);
  mockUnmuteMember.mockResolvedValue(undefined);
  mockIsUserMuted.mockResolvedValue(false);
});

describe("POST /api/v1/members/[userId]/mute", () => {
  it("mutes target user and returns 200 { ok: true }", async () => {
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(mockMuteMember).toHaveBeenCalledWith(USER_ID, TARGET_ID);
  });

  it("returns 400 when trying to mute self", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: TARGET_ID, role: "MEMBER" });
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/yourself/);
  });

  it("returns 400 for invalid UUID in path", async () => {
    const req = new Request("https://example.com/api/v1/members/not-a-uuid/mute", {
      method: "POST",
      headers: { Host: "example.com", Origin: "https://example.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("requires Origin header (CSRF)", async () => {
    const req = new Request(`https://example.com/api/v1/members/${TARGET_ID}/mute`, {
      method: "POST",
      headers: { Host: "example.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/v1/members/[userId]/mute", () => {
  it("unmutes target user and returns 200 { ok: true }", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(mockUnmuteMember).toHaveBeenCalledWith(USER_ID, TARGET_ID);
  });

  it("requires Origin header (CSRF)", async () => {
    const req = new Request(`https://example.com/api/v1/members/${TARGET_ID}/mute`, {
      method: "DELETE",
      headers: { Host: "example.com" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/members/[userId]/mute", () => {
  it("returns { isMuted: false } when not muted", async () => {
    mockIsUserMuted.mockResolvedValue(false);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isMuted).toBe(false);
  });

  it("returns { isMuted: true } when muted", async () => {
    mockIsUserMuted.mockResolvedValue(true);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isMuted).toBe(true);
  });
});
