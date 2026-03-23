// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const mockInitiateLogin = vi.fn();

vi.mock("@/services/auth-service", () => ({
  initiateLogin: (...args: unknown[]) => mockInitiateLogin(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));
vi.mock("@/env", () => ({
  env: { ACCOUNT_LOCKOUT_SECONDS: 900, ACCOUNT_LOCKOUT_ATTEMPTS: 5 },
}));

import { POST } from "./route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/login", () => {
  it("returns 200 with challengeToken when 2FA required", async () => {
    mockInitiateLogin.mockResolvedValue({
      status: "requires_2fa",
      challengeToken: "token-abc",
    });

    const res = await POST(makeRequest({ email: "user@example.com", password: "Pass1!" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.challengeToken).toBe("token-abc");
    expect(body.data.requiresMfaSetup).toBe(false);
  });

  it("returns 200 with requiresMfaSetup when 2FA setup needed", async () => {
    mockInitiateLogin.mockResolvedValue({
      status: "requires_2fa_setup",
      challengeToken: "setup-token",
    });

    const res = await POST(makeRequest({ email: "new@example.com", password: "Pass1!" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.requiresMfaSetup).toBe(true);
  });

  it("returns 401 for invalid credentials", async () => {
    mockInitiateLogin.mockResolvedValue({ status: "invalid" });

    const res = await POST(makeRequest({ email: "bad@example.com", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when account is locked", async () => {
    mockInitiateLogin.mockResolvedValue({ status: "locked", lockoutSeconds: 900 });

    const res = await POST(makeRequest({ email: "locked@example.com", password: "Pass1!" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid request body", async () => {
    const res = await POST(makeRequest({ notEmail: "x" }));
    expect(res.status).toBe(400);
  });

  it("does not reveal which email exists (uniform error)", async () => {
    mockInitiateLogin.mockResolvedValue({ status: "invalid" });

    const res = await POST(makeRequest({ email: "nonexistent@example.com", password: "pass" }));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.detail).toBe("Invalid credentials");
  });

  it("returns 403 when initiateLogin returns banned status (Epic 11 Stabilization)", async () => {
    mockInitiateLogin.mockResolvedValue({
      status: "banned",
      reason: "Hate speech",
      appealEmail: "abuse@igbo.global",
      appealWindow: "14 days",
    });

    const res = await POST(makeRequest({ email: "banned@example.com", password: "Pass1!" }));
    expect(res.status).toBe(403);
  });

  it("banned response detail is 'banned' (not the reason — no leaking)", async () => {
    mockInitiateLogin.mockResolvedValue({
      status: "banned",
      reason: "Internal reason details",
      appealEmail: "abuse@igbo.global",
      appealWindow: "14 days",
    });

    const res = await POST(makeRequest({ email: "banned@example.com", password: "Pass1!" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.detail).toBe("banned");
  });

  // ─── Suspended user login flow ──────────────────────────────────────────────

  it("returns 403 with detail 'suspended' for suspended user", async () => {
    mockInitiateLogin.mockResolvedValue({
      status: "suspended",
      until: "2026-04-01T00:00:00.000Z",
      reason: "Repeated harassment",
    });

    const res = await POST(makeRequest({ email: "suspended@example.com", password: "Pass1!" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.detail).toBe("suspended");
    expect(body.until).toBe("2026-04-01T00:00:00.000Z");
    expect(body.reason).toBe("Repeated harassment");
  });

  it("returns 403 with detail 'suspended' without until/reason when not available", async () => {
    mockInitiateLogin.mockResolvedValue({
      status: "suspended",
    });

    const res = await POST(makeRequest({ email: "suspended@example.com", password: "Pass1!" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.detail).toBe("suspended");
  });
});
