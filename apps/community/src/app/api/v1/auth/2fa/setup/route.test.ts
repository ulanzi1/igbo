// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const mockGetChallenge = vi.fn();
const mockGenerate2faSecret = vi.fn();
const mockVerify2faAndComplete = vi.fn();
const mockFindUserById = vi.fn();

vi.mock("@/server/auth/config", () => ({
  getChallenge: (...args: unknown[]) => mockGetChallenge(...args),
}));
vi.mock("@/services/auth-service", () => ({
  generate2faSecret: (...args: unknown[]) => mockGenerate2faSecret(...args),
  verify2faAndComplete: (...args: unknown[]) => mockVerify2faAndComplete(...args),
}));
vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getRequestContext: vi.fn(() => undefined),
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 900_000, limit: 5 }),
}));

import { GET, POST } from "./route";

function makeGetRequest(challengeToken?: string) {
  const url = challengeToken
    ? `https://example.com/api/v1/auth/2fa/setup?challengeToken=${challengeToken}`
    : "https://example.com/api/v1/auth/2fa/setup";
  return new Request(url, {
    method: "GET",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/v1/auth/2fa/setup", {
    method: "POST",
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
});

describe("GET /api/v1/auth/2fa/setup", () => {
  it("returns 200 with QR code data for valid challenge token", async () => {
    mockGetChallenge.mockResolvedValue({ userId: "user-1", mfaVerified: false });
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      accountStatus: "APPROVED",
    });
    mockGenerate2faSecret.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/Igbo:user@example.com?secret=JBSWY3DPEHPK3PXP",
      qrCodeDataUrl: "data:image/png;base64,abc123",
    });

    const res = await GET(makeGetRequest("valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(body.data.otpauthUri).toContain("otpauth://totp/");
    expect(body.data.qrCodeDataUrl).toContain("data:image/png");
  });

  it("returns 400 when challengeToken is missing", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 when challenge is invalid", async () => {
    mockGetChallenge.mockResolvedValue(null);

    const res = await GET(makeGetRequest("invalid-token"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when challenge is already mfaVerified", async () => {
    mockGetChallenge.mockResolvedValue({ userId: "user-1", mfaVerified: true });

    const res = await GET(makeGetRequest("already-verified"));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 900_000,
      limit: 5,
    });
    mockGetChallenge.mockResolvedValue({ userId: "user-1", mfaVerified: false });

    const res = await GET(makeGetRequest("valid-token"));
    expect(res.status).toBe(429);
  });

  it("returns 401 when user is not approved", async () => {
    mockGetChallenge.mockResolvedValue({ userId: "user-1", mfaVerified: false });
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      accountStatus: "PENDING",
    });

    const res = await GET(makeGetRequest("valid-token"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/2fa/setup", () => {
  it("returns 200 with recovery codes on valid TOTP code", async () => {
    mockGetChallenge.mockResolvedValue({ userId: "user-1" });
    mockVerify2faAndComplete.mockResolvedValue({
      recoveryCodes: ["code1", "code2", "code3"],
    });

    const res = await POST(
      makePostRequest({
        challengeToken: "token-abc",
        secret: "JBSWY3DPEHPK3PXP",
        code: "123456",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recoveryCodes).toEqual(["code1", "code2", "code3"]);
    expect(body.data.challengeToken).toBe("token-abc");
  });

  it("returns 400 when challenge token is invalid", async () => {
    mockGetChallenge.mockResolvedValue(null);

    const res = await POST(
      makePostRequest({
        challengeToken: "bad-token",
        secret: "JBSWY3DPEHPK3PXP",
        code: "123456",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makePostRequest({ challengeToken: "tok" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when challenge is already mfaVerified (replay)", async () => {
    mockGetChallenge.mockResolvedValue({ userId: "user-1", mfaVerified: true });

    const res = await POST(
      makePostRequest({
        challengeToken: "token-abc",
        secret: "JBSWY3DPEHPK3PXP",
        code: "123456",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid code length", async () => {
    const res = await POST(
      makePostRequest({
        challengeToken: "token-abc",
        secret: "JBSWY3DPEHPK3PXP",
        code: "12", // too short
      }),
    );
    expect(res.status).toBe(400);
  });
});
