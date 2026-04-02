// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResetPassword = vi.fn();

vi.mock("@/services/auth-service", () => ({
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/v1/auth/reset-password", {
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

const VALID_BODY = { token: "tok123", password: "MyStr0ng!Pass" };

describe("POST /api/v1/auth/reset-password", () => {
  it("returns 200 on successful reset", async () => {
    mockResetPassword.mockResolvedValue(undefined);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toContain("reset successfully");
  });

  it("returns 400 for weak password (missing special char)", async () => {
    const res = await POST(makeRequest({ token: "tok", password: "MyPassword1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid/expired token", async () => {
    mockResetPassword.mockRejectedValue(
      new ApiError({ title: "Bad Request", status: 400, detail: "Invalid or expired reset token" }),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("calls resetPassword with correct args", async () => {
    mockResetPassword.mockResolvedValue(undefined);
    await POST(makeRequest(VALID_BODY));
    expect(mockResetPassword).toHaveBeenCalledWith("tok123", "MyStr0ng!Pass");
  });
});
