// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockRequestAccountDeletion = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/gdpr-service", () => ({
  requestAccountDeletion: (...args: unknown[]) => mockRequestAccountDeletion(...args),
  findAccountsPendingAnonymization: vi.fn(),
  anonymizeAccount: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/v1/user/account/delete", {
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
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockRequestAccountDeletion.mockResolvedValue(undefined);
});

describe("POST /api/v1/user/account/delete", () => {
  it("returns 200 on valid password", async () => {
    const req = makePostRequest({ password: "SecurePass1!" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toContain("Deletion scheduled");
  });

  it("calls requestAccountDeletion with userId and password", async () => {
    const req = makePostRequest({ password: "SecurePass1!" });
    await POST(req);
    expect(mockRequestAccountDeletion).toHaveBeenCalledWith(USER_ID, "SecurePass1!");
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = makePostRequest({ password: "SecurePass1!" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when password is wrong", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequestAccountDeletion.mockRejectedValue(
      new ApiError({ title: "Bad Request", status: 400, detail: "Incorrect password" }),
    );
    const req = makePostRequest({ password: "wrongpass" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing password field", async () => {
    const req = makePostRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://example.com/api/v1/user/account/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "example.com",
        Origin: "https://example.com",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
