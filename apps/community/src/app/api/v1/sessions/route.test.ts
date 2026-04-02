// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAuthenticatedSession = vi.fn();
const mockGetUserSessions = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));
vi.mock("@/services/auth-service", () => ({
  getUserSessions: (...args: unknown[]) => mockGetUserSessions(...args),
  enforceMaxSessions: vi.fn(),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const USER_ID = "user-uuid-1";
const MOCK_SESSION = {
  id: "sess-uuid-1",
  sessionToken: "tok",
  userId: USER_ID,
  expires: new Date(Date.now() + 86400000),
  deviceName: "Chrome on macOS",
  deviceIp: "1.2.3.4",
  deviceLocation: null,
  lastActiveAt: new Date(),
  createdAt: new Date(),
};

function makeGetRequest() {
  return new Request("https://example.com/api/v1/sessions", {
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetUserSessions.mockResolvedValue([MOCK_SESSION]);
});

describe("GET /api/v1/sessions", () => {
  it("returns list of sessions for authenticated user", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("sess-uuid-1");
    expect(body.data[0].deviceName).toBe("Chrome on macOS");
    // Must not expose session token
    expect(body.data[0].sessionToken).toBeUndefined();
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });
});
