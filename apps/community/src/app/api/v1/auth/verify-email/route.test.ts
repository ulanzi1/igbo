// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockConsumeToken = vi.fn();
const mockFindTokenByHash = vi.fn();
const mockTransitionUser = vi.fn();
const mockFindUserById = vi.fn();

vi.mock("@/db/queries/auth-queries", () => ({
  consumeVerificationToken: (...args: unknown[]) => mockConsumeToken(...args),
  findTokenByHash: (...args: unknown[]) => mockFindTokenByHash(...args),
  transitionUserToApprovalPending: (...args: unknown[]) => mockTransitionUser(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@/services/email-service", () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
  enqueueEmailJob: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://obigbo.example.com" },
}));

import { GET } from "./route";
import { eventBus } from "@/services/event-bus";

const RAW_TOKEN = "abc123deadbeef".repeat(4); // 56 chars
const TOKEN_HASH = createHash("sha256").update(RAW_TOKEN).digest("hex");
const USER_ID = "user-uuid-1234";

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("https://obigbo.example.com/api/v1/auth/verify-email");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString(), {
    headers: { Origin: "https://obigbo.example.com", Host: "obigbo.example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConsumeToken.mockResolvedValue({
    id: "token-id-1",
    userId: USER_ID,
    tokenHash: TOKEN_HASH,
    expiresAt: new Date(Date.now() + 3600000),
    usedAt: null,
  });
  mockTransitionUser.mockResolvedValue({
    id: USER_ID,
    email: "test@example.com",
    name: "Test User",
    accountStatus: "PENDING_APPROVAL",
  });
  mockFindTokenByHash.mockResolvedValue(null);
});

describe("GET /api/v1/auth/verify-email", () => {
  describe("valid token", () => {
    it("redirects to email-verified status page", async () => {
      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      const res = await GET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toContain("status=email-verified");
    });

    it("calls consumeVerificationToken with SHA-256 hash of raw token", async () => {
      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      await GET(req);
      expect(mockConsumeToken).toHaveBeenCalledWith(TOKEN_HASH);
    });

    it("transitions user to PENDING_APPROVAL state", async () => {
      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      await GET(req);
      expect(mockTransitionUser).toHaveBeenCalledWith(USER_ID);
    });

    it("emits user.email_verified event", async () => {
      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      await GET(req);
      expect(eventBus.emit).toHaveBeenCalledWith(
        "user.email_verified",
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it("sets used_at atomically by delegating to consumeVerificationToken", async () => {
      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      await GET(req);
      // consumeVerificationToken handles atomic update; just verify it was called once
      expect(mockConsumeToken).toHaveBeenCalledOnce();
    });
  });

  describe("expired or already-used token", () => {
    it("redirects to token-expired when consumeToken returns null and token exists in DB", async () => {
      mockConsumeToken.mockResolvedValue(null);
      mockFindTokenByHash.mockResolvedValue({
        id: "token-id-1",
        tokenHash: TOKEN_HASH,
        usedAt: new Date(),
      });

      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      const res = await GET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toContain("status=token-expired");
    });

    it("does NOT transition user for already-used token", async () => {
      mockConsumeToken.mockResolvedValue(null);
      mockFindTokenByHash.mockResolvedValue({ id: "token-id-1", tokenHash: TOKEN_HASH });

      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      await GET(req);
      expect(mockTransitionUser).not.toHaveBeenCalled();
    });
  });

  describe("invalid token", () => {
    it("redirects to token-invalid for completely unknown token", async () => {
      mockConsumeToken.mockResolvedValue(null);
      mockFindTokenByHash.mockResolvedValue(null); // Not in DB at all

      const req = makeRequest({ token: "unknown-token", userId: USER_ID });
      const res = await GET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toContain("status=token-invalid");
    });

    it("redirects to token-invalid when token param is missing", async () => {
      const req = makeRequest({ userId: USER_ID });
      const res = await GET(req);
      expect(res.headers.get("Location")).toContain("status=token-invalid");
    });

    it("redirects to token-invalid when userId param is missing", async () => {
      const req = makeRequest({ token: RAW_TOKEN });
      const res = await GET(req);
      expect(res.headers.get("Location")).toContain("status=token-invalid");
    });

    it("redirects to token-invalid when userId does not match token", async () => {
      mockConsumeToken.mockResolvedValue({
        id: "token-id-1",
        userId: "different-user-id",
        tokenHash: TOKEN_HASH,
      });

      const req = makeRequest({ token: RAW_TOKEN, userId: USER_ID });
      const res = await GET(req);
      expect(res.headers.get("Location")).toContain("status=token-invalid");
    });
  });
});
