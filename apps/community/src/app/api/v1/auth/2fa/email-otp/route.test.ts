// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const mockGetChallenge = vi.fn();
const mockSendEmailOtp = vi.fn();
const mockVerifyEmailOtp = vi.fn();

vi.mock("@igbo/auth", () => ({
  getChallenge: (...args: unknown[]) => mockGetChallenge(...args),
}));
vi.mock("@/services/auth-service", () => ({
  sendEmailOtp: (...args: unknown[]) => mockSendEmailOtp(...args),
  verifyEmailOtp: (...args: unknown[]) => mockVerifyEmailOtp(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/v1/auth/2fa/email-otp", {
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

describe("POST /api/v1/auth/2fa/email-otp", () => {
  describe("request OTP (no code field)", () => {
    it("returns 200 with sent: true on success", async () => {
      mockGetChallenge.mockResolvedValue({ userId: "user-1" });
      mockSendEmailOtp.mockResolvedValue(undefined);

      const res = await POST(makeRequest({ challengeToken: "token-abc" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.sent).toBe(true);
      expect(mockSendEmailOtp).toHaveBeenCalledWith("user-1", "token-abc");
    });

    it("returns 400 when challengeToken is missing", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
    });

    it("returns 400 when challenge is invalid", async () => {
      mockGetChallenge.mockResolvedValue(null);

      const res = await POST(makeRequest({ challengeToken: "bad-token" }));
      expect(res.status).toBe(400);
    });
  });

  describe("verify OTP (code field present)", () => {
    it("returns 200 with challengeToken on valid OTP code", async () => {
      mockGetChallenge.mockResolvedValue({ userId: "user-1" });
      mockVerifyEmailOtp.mockResolvedValue({ status: "ok", challengeToken: "verified-token" });

      const res = await POST(makeRequest({ challengeToken: "token-abc", code: "123456" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.challengeToken).toBe("verified-token");
      expect(mockVerifyEmailOtp).toHaveBeenCalledWith("token-abc", "user-1", "123456");
    });

    it("returns 401 for invalid OTP code", async () => {
      mockGetChallenge.mockResolvedValue({ userId: "user-1" });
      mockVerifyEmailOtp.mockResolvedValue({ status: "invalid" });

      const res = await POST(makeRequest({ challengeToken: "token-abc", code: "000000" }));
      expect(res.status).toBe(401);
    });

    it("returns 400 when challenge is invalid during verification", async () => {
      mockGetChallenge.mockResolvedValue(null);

      const res = await POST(makeRequest({ challengeToken: "bad-token", code: "123456" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid code length", async () => {
      const res = await POST(makeRequest({ challengeToken: "token-abc", code: "12" }));
      expect(res.status).toBe(400);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when sendEmailOtp throws rate limit ApiError", async () => {
      const { ApiError } = await import("@/lib/api-error");
      mockGetChallenge.mockResolvedValue({ userId: "user-1" });
      mockSendEmailOtp.mockRejectedValue(
        new ApiError({ title: "Too Many Requests", status: 429, detail: "Rate limit exceeded" }),
      );

      const res = await POST(makeRequest({ challengeToken: "token-abc" }));
      expect(res.status).toBe(429);
    });
  });
});
