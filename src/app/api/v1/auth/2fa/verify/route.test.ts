// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerify2fa = vi.fn();

vi.mock("@/services/auth-service", () => ({
  verify2fa: (...args: unknown[]) => mockVerify2fa(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/v1/auth/2fa/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/auth/2fa/verify", () => {
  it("returns 200 with challengeToken on valid code", async () => {
    mockVerify2fa.mockResolvedValue({ status: "ok", challengeToken: "verified-token" });

    const res = await POST(makeRequest({ challengeToken: VALID_UUID, code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.challengeToken).toBe("verified-token");
  });

  it("returns 401 for invalid 2FA code", async () => {
    mockVerify2fa.mockResolvedValue({ status: "invalid" });

    const res = await POST(makeRequest({ challengeToken: VALID_UUID, code: "000000" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const res = await POST(makeRequest({ challengeToken: "tok" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-UUID challengeToken", async () => {
    const res = await POST(makeRequest({ challengeToken: "not-a-uuid", code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for code shorter than 6 characters", async () => {
    const res = await POST(makeRequest({ challengeToken: VALID_UUID, code: "123" }));
    expect(res.status).toBe(400);
  });
});
