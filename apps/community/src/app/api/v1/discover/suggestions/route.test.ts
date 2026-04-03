// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetMemberSuggestions = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/suggestion-service", () => ({
  getMemberSuggestions: (...args: unknown[]) => mockGetMemberSuggestions(...args),
  dismissSuggestion: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    MEMBER_SUGGESTIONS: { maxRequests: 30, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Date.now() + 60_000,
    limit: 30,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({ "X-RateLimit-Limit": "30" }),
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";

const MOCK_SUGGESTIONS = [
  {
    member: {
      userId: USER_B,
      displayName: "Alice",
      photoUrl: null,
      locationCity: "Houston",
      locationState: "Texas",
      locationCountry: "United States",
      interests: [],
      languages: [],
      membershipTier: "BASIC" as const,
      bio: null,
    },
    reasonType: "city",
    reasonValue: "Houston",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID });
  mockGetMemberSuggestions.mockResolvedValue(MOCK_SUGGESTIONS);
});

describe("GET /api/v1/discover/suggestions", () => {
  it("returns 200 with suggestions on success", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { suggestions: unknown[] } };
    expect(body.data.suggestions).toEqual(MOCK_SUGGESTIONS);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("passes limit param to getMemberSuggestions", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions?limit=3");
    await GET(req);
    expect(mockGetMemberSuggestions).toHaveBeenCalledWith(USER_ID, 3);
  });

  it("uses default limit of 5 when limit param absent", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions");
    await GET(req);
    expect(mockGetMemberSuggestions).toHaveBeenCalledWith(USER_ID, 5);
  });

  it("includes rate limit headers on response", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions");
    const res = await GET(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
  });

  it("falls back to default limit=5 when limit param is below range", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions?limit=0");
    await GET(req);
    expect(mockGetMemberSuggestions).toHaveBeenCalledWith(USER_ID, 5);
  });

  it("falls back to default limit=5 when limit param is above range", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions?limit=11");
    await GET(req);
    expect(mockGetMemberSuggestions).toHaveBeenCalledWith(USER_ID, 5);
  });

  it("falls back to default limit=5 when limit param is non-numeric", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions?limit=abc");
    await GET(req);
    expect(mockGetMemberSuggestions).toHaveBeenCalledWith(USER_ID, 5);
  });

  it("falls back to default limit=5 when limit param is negative", async () => {
    const req = new Request("http://localhost:3000/api/v1/discover/suggestions?limit=-1");
    await GET(req);
    expect(mockGetMemberSuggestions).toHaveBeenCalledWith(USER_ID, 5);
  });
});
