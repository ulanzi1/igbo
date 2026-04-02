// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedisGet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
    del: mockRedisDel,
  }),
}));

vi.mock("@/services/profile-service", () => ({
  linkSocialAccount: vi.fn(),
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

import * as profileService from "@/services/profile-service";
import { GET } from "./route";

const mockLinkSocial = vi.mocked(profileService.linkSocialAccount);

beforeEach(() => {
  vi.resetAllMocks();
  global.fetch = vi.fn();
});

function makeCallbackRequest(provider: string, code = "auth-code", state = "state-123") {
  return {
    url: `https://app.example.com/api/v1/profiles/social-link/${provider}/callback?code=${code}&state=${state}`,
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/v1/profiles/social-link/[provider]/callback", () => {
  it("redirects with error for invalid provider", async () => {
    const response = await GET(makeCallbackRequest("invalid"), {
      params: Promise.resolve({ provider: "invalid" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=oauth_failed");
  });

  it("redirects with error when code is missing", async () => {
    const req = {
      url: "https://app.example.com/api/v1/profiles/social-link/facebook/callback?state=abc",
    } as unknown as import("next/server").NextRequest;

    const response = await GET(req, {
      params: Promise.resolve({ provider: "facebook" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=oauth_failed");
  });

  it("redirects with error when state is missing", async () => {
    const req = {
      url: "https://app.example.com/api/v1/profiles/social-link/facebook/callback?code=abc",
    } as unknown as import("next/server").NextRequest;

    const response = await GET(req, {
      params: Promise.resolve({ provider: "facebook" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=oauth_failed");
  });

  it("redirects with error when state not found in Redis", async () => {
    mockRedisGet.mockResolvedValue(null);

    const response = await GET(makeCallbackRequest("facebook"), {
      params: Promise.resolve({ provider: "facebook" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=oauth_failed");
  });

  it("redirects with error when stored provider does not match", async () => {
    mockRedisGet.mockResolvedValue("user-1:LINKEDIN:en");

    const response = await GET(makeCallbackRequest("facebook"), {
      params: Promise.resolve({ provider: "facebook" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=oauth_failed");
  });

  it("successfully links Facebook account and redirects to success", async () => {
    mockRedisGet.mockResolvedValue("user-1:FACEBOOK:en");
    mockRedisDel.mockResolvedValue(1);
    mockLinkSocial.mockResolvedValue(undefined);

    // Mock token exchange
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "fb-token" }),
      })
      // Mock profile fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "123", name: "John", link: "https://facebook.com/john" }),
      });

    const response = await GET(makeCallbackRequest("facebook"), {
      params: Promise.resolve({ provider: "facebook" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/en/settings/privacy?linked=FACEBOOK");
    expect(mockLinkSocial).toHaveBeenCalledWith(
      "user-1",
      "FACEBOOK",
      "John",
      "https://facebook.com/john",
    );
    expect(mockRedisDel).toHaveBeenCalled();
  });

  it("redirects with error when token exchange fails", async () => {
    mockRedisGet.mockResolvedValue("user-1:FACEBOOK:ig");
    mockRedisDel.mockResolvedValue(1);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const response = await GET(makeCallbackRequest("facebook"), {
      params: Promise.resolve({ provider: "facebook" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=oauth_failed");
    // Should use the stored locale (ig)
    expect(response.headers.get("Location")).toMatch(/^\/ig\//);
  });

  it("requires PKCE verifier for Twitter", async () => {
    // First get returns state, second get returns PKCE verifier
    mockRedisGet
      .mockResolvedValueOnce("user-1:TWITTER:en")
      .mockResolvedValueOnce("pkce-verifier-123");
    mockRedisDel.mockResolvedValue(1);

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "tw-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { username: "testuser" } }),
      });

    const response = await GET(makeCallbackRequest("twitter"), {
      params: Promise.resolve({ provider: "twitter" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("linked=TWITTER");
    expect(mockLinkSocial).toHaveBeenCalledWith(
      "user-1",
      "TWITTER",
      "@testuser",
      "https://twitter.com/testuser",
    );
  });

  it("redirects with error when Twitter PKCE verifier not found", async () => {
    mockRedisGet.mockResolvedValueOnce("user-1:TWITTER:en").mockResolvedValueOnce(null); // No PKCE verifier

    const response = await GET(makeCallbackRequest("twitter"), {
      params: Promise.resolve({ provider: "twitter" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=oauth_failed");
  });

  it("uses stored locale for redirect URLs", async () => {
    mockRedisGet.mockResolvedValue("user-1:FACEBOOK:ig");
    mockRedisDel.mockResolvedValue(1);
    mockLinkSocial.mockResolvedValue(undefined);

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "tk" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "1", name: "U" }),
      });

    const response = await GET(makeCallbackRequest("facebook"), {
      params: Promise.resolve({ provider: "facebook" }),
    });

    expect(response.headers.get("Location")).toMatch(/^\/ig\//);
  });
});
