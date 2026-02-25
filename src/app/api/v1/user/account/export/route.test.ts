// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockRequestDataExport = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockBuildRateLimitHeaders = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/gdpr-service", () => ({
  requestDataExport: (...args: unknown[]) => mockRequestDataExport(...args),
  findAccountsPendingAnonymization: vi.fn(),
  anonymizeAccount: vi.fn(),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GDPR_EXPORT: { maxRequests: 1, windowMs: 604_800_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildRateLimitHeaders: (...args: unknown[]) => mockBuildRateLimitHeaders(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const REQUEST_ID = "req-id-12345";

function makePostRequest() {
  return new Request("https://example.com/api/v1/user/account/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockRequestDataExport.mockResolvedValue({ requestId: REQUEST_ID });
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 0,
    resetAt: Date.now() + 604_800_000,
    limit: 1,
  });
  mockBuildRateLimitHeaders.mockReturnValue({
    "X-RateLimit-Limit": "1",
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": "9999999999",
  });
});

describe("POST /api/v1/user/account/export", () => {
  it("returns 202 Accepted on first request", async () => {
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.requestId).toBe(REQUEST_ID);
  });

  it("returns 429 with rate limit headers when limit exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 604_800_000,
      limit: 1,
    });
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.title).toBe("Too Many Requests");
    expect(body.status).toBe(429);
  });

  it("returns 429 with X-RateLimit-* headers", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 604_800_000,
      limit: 1,
    });
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1");
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
