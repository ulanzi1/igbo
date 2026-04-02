// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockUpdateLanguagePreference = vi.fn();
const mockAuth = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/auth-queries", () => ({
  updateLanguagePreference: (...args: unknown[]) => mockUpdateLanguagePreference(...args),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@igbo/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
  getChallenge: vi.fn(),
  setChallenge: vi.fn(),
  deleteChallenge: vi.fn(),
  CHALLENGE_TTL: 300,
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    LANGUAGE_UPDATE: { maxRequests: 30, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Date.now() + 60_000,
    limit: 30,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({
    "X-RateLimit-Limit": "30",
    "X-RateLimit-Remaining": "29",
    "X-RateLimit-Reset": "9999999999",
  }),
}));

import { PATCH } from "./route";

const USER_ID = "user-uuid-1";

function makePatchRequest(body: unknown) {
  return new Request("https://example.com/api/v1/user/language", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockUpdateLanguagePreference.mockResolvedValue(undefined);
  mockAuth.mockResolvedValue({ user: { id: USER_ID } });
});

describe("PATCH /api/v1/user/language", () => {
  it("returns 200 on valid locale change to ig", async () => {
    const req = makePatchRequest({ locale: "ig" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.locale).toBe("ig");
  });

  it("returns 200 on valid locale change to en", async () => {
    const req = makePatchRequest({ locale: "en" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.locale).toBe("en");
  });

  it("calls updateLanguagePreference with userId and locale", async () => {
    const req = makePatchRequest({ locale: "ig" });
    await PATCH(req);
    expect(mockUpdateLanguagePreference).toHaveBeenCalledWith(USER_ID, "ig");
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = makePatchRequest({ locale: "ig" });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid locale value", async () => {
    const req = makePatchRequest({ locale: "fr" });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing locale in body", async () => {
    const req = makePatchRequest({});
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://example.com/api/v1/user/language", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Host: "example.com",
        Origin: "https://example.com",
      },
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 on DB failure", async () => {
    mockUpdateLanguagePreference.mockRejectedValue(new Error("DB connection failed"));
    const req = makePatchRequest({ locale: "ig" });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });
});
