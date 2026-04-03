// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAuthenticatedSession = vi.fn();
const mockRevokeSession = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));
vi.mock("@/services/auth-service", () => ({
  revokeSession: (...args: unknown[]) => mockRevokeSession(...args),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { DELETE } from "./route";

const USER_ID = "user-uuid-1";
const SESSION_ID = "sess-uuid-1";

function makeDeleteRequest(sessionId = SESSION_ID) {
  return new Request(`https://example.com/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockRevokeSession.mockResolvedValue(undefined);
});

describe("DELETE /api/v1/sessions/[sessionId]", () => {
  it("returns 200 on successful revocation", async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toContain("revoked");
  });

  it("calls revokeSession with session id and user id", async () => {
    await DELETE(makeDeleteRequest());
    expect(mockRevokeSession).toHaveBeenCalledWith(SESSION_ID, USER_ID);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(401);
  });
});
