// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/services/email-service", () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
  enqueueEmailJob: vi.fn(),
}));

const mockFindUserByEmail = vi.fn();
const mockCreateVerificationToken = vi.fn();
const mockDeleteUserVerificationTokens = vi.fn();

vi.mock("@/db/queries/auth-queries", () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  createVerificationToken: (...args: unknown[]) => mockCreateVerificationToken(...args),
  deleteUserVerificationTokens: (...args: unknown[]) => mockDeleteUserVerificationTokens(...args),
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://obigbo.example.com" },
}));

import { resendVerification } from "./resend-verification";

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: Date.now() + 3600000,
  });
  mockFindUserByEmail.mockResolvedValue({
    id: "user-uuid-1",
    email: "test@example.com",
    name: "Test User",
    accountStatus: "PENDING_EMAIL_VERIFICATION",
  });
  mockDeleteUserVerificationTokens.mockResolvedValue(undefined);
  mockCreateVerificationToken.mockResolvedValue({ id: "token-uuid-1" });
});

describe("resendVerification", () => {
  it("returns success for a valid pending user", async () => {
    const result = await resendVerification("test@example.com");
    expect(result.success).toBe(true);
  });

  it("deletes old tokens and creates a new verification token", async () => {
    await resendVerification("test@example.com");
    expect(mockDeleteUserVerificationTokens).toHaveBeenCalledWith("user-uuid-1");
    expect(mockCreateVerificationToken).toHaveBeenCalledOnce();
    const args = mockCreateVerificationToken.mock.calls[0][0];
    expect(args.userId).toBe("user-uuid-1");
    expect(args.tokenHash).toBeTruthy();
    expect(args.expiresAt).toBeInstanceOf(Date);
  });

  it("enforces rate limit (3 resends per email per hour)", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 3600000,
    });
    const result = await resendVerification("test@example.com");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Too many requests");
    }
    expect(mockCreateVerificationToken).not.toHaveBeenCalled();
  });

  it("returns success even when email is not found (prevents enumeration)", async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    const result = await resendVerification("unknown@example.com");
    // Return success to prevent email enumeration
    expect(result.success).toBe(true);
    expect(mockCreateVerificationToken).not.toHaveBeenCalled();
  });

  it("returns success for user in non-pending state (no new token)", async () => {
    mockFindUserByEmail.mockResolvedValue({
      id: "user-uuid-2",
      email: "approved@example.com",
      accountStatus: "APPROVED",
    });
    const result = await resendVerification("approved@example.com");
    expect(result.success).toBe(true);
    expect(mockCreateVerificationToken).not.toHaveBeenCalled();
  });

  it("returns error for invalid email format", async () => {
    const result = await resendVerification("not-an-email");
    expect(result.success).toBe(false);
  });

  it("calls checkRateLimit with email-based key", async () => {
    await resendVerification("test@example.com");
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("test@example.com"),
      3,
      expect.any(Number),
    );
  });
});
