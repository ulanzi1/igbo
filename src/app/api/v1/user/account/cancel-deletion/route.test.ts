// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCancelAccountDeletion = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockBuildRateLimitHeaders = vi.fn();

vi.mock("@/services/gdpr-service", () => ({
  cancelAccountDeletion: (...args: unknown[]) => mockCancelAccountDeletion(...args),
  findAccountsPendingAnonymization: vi.fn(),
  anonymizeAccount: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildRateLimitHeaders: (...args: unknown[]) => mockBuildRateLimitHeaders(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/v1/user/account/cancel-deletion", {
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
  mockCancelAccountDeletion.mockResolvedValue(undefined);
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 900_000,
    limit: 5,
  });
  mockBuildRateLimitHeaders.mockReturnValue({
    "X-RateLimit-Limit": "5",
    "X-RateLimit-Remaining": "4",
    "X-RateLimit-Reset": "9999999999",
  });
});

describe("POST /api/v1/user/account/cancel-deletion", () => {
  it("returns 200 on valid token and userId", async () => {
    const req = makePostRequest({ token: "valid-token", userId: USER_ID });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toContain("cancelled");
  });

  it("calls cancelAccountDeletion with token and userId", async () => {
    const req = makePostRequest({ token: "my-token", userId: USER_ID });
    await POST(req);
    expect(mockCancelAccountDeletion).toHaveBeenCalledWith("my-token", USER_ID);
  });

  it("returns 400 when token is invalid", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockCancelAccountDeletion.mockRejectedValue(
      new ApiError({ title: "Bad Request", status: 400, detail: "Invalid or expired token" }),
    );
    const req = makePostRequest({ token: "bad-token", userId: USER_ID });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing fields", async () => {
    const req = makePostRequest({ token: "only-token" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
