// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequestPasswordReset = vi.fn();

vi.mock("@/services/auth-service", () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/v1/auth/forgot-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/auth/forgot-password", () => {
  it("always returns 200 (prevents enumeration) for valid email", async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);

    const res = await POST(makeRequest({ email: "user@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toContain("If an account");
  });

  it("still returns 200 for non-existent email (prevents enumeration)", async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);

    const res = await POST(makeRequest({ email: "noone@example.com" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
