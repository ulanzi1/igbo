// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}));

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    FACEBOOK_APP_ID: "fb-id",
    FACEBOOK_APP_SECRET: "fb-secret",
    LINKEDIN_CLIENT_ID: "li-id",
    LINKEDIN_CLIENT_SECRET: "li-secret",
    X_CLIENT_ID: "x-id",
    X_CLIENT_SECRET: "x-secret",
    INSTAGRAM_APP_ID: "ig-id",
    INSTAGRAM_APP_SECRET: "ig-secret",
  },
}));

import { requireAuthenticatedSession } from "@igbo/auth/permissions";
const mockRequireAuth = vi.mocked(requireAuthenticatedSession);

import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: "user-1" } as never);
  mockRedisSet.mockResolvedValue("OK");
});

function makeRequest(provider: string) {
  return new Request(`https://app.example.com/api/v1/profiles/social-link/${provider}`, {
    headers: { "accept-language": "en-US,en;q=0.9" },
  });
}

describe("GET /api/v1/profiles/social-link/[provider]", () => {
  it("returns 302 redirect to Facebook OAuth URL for facebook provider", async () => {
    const response = await GET(makeRequest("facebook"));

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toContain("facebook.com");
    expect(location).toContain("client_id=fb-id");
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it("returns 302 redirect to LinkedIn OAuth URL", async () => {
    const response = await GET(makeRequest("linkedin"));

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toContain("linkedin.com");
    expect(location).toContain("client_id=li-id");
  });

  it("stores PKCE verifier in Redis for twitter", async () => {
    const response = await GET(makeRequest("twitter"));

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toContain("twitter.com");
    expect(location).toContain("code_challenge_method=S256");

    // Should store both state and PKCE verifier
    expect(mockRedisSet).toHaveBeenCalledTimes(2);
    const pkceCall = mockRedisSet.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" && (c[0] as string).startsWith("social_link_pkce:"),
    );
    expect(pkceCall).toBeDefined();
  });

  it("returns 400 for invalid provider", async () => {
    const response = await GET(makeRequest("invalid_provider"));

    expect(response.status).toBe(400);
  });

  it("stores state with userId, provider, and locale in Redis", async () => {
    await GET(makeRequest("facebook"));

    const stateCall = mockRedisSet.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" && (c[0] as string).startsWith("social_link_state:"),
    );
    expect(stateCall).toBeDefined();
    const stateValue = stateCall![1] as string;
    expect(stateValue).toContain("user-1");
    expect(stateValue).toContain("FACEBOOK");
    // TTL should be 600
    expect(stateCall![2]).toBe("EX");
    expect(stateCall![3]).toBe(600);
  });
});
