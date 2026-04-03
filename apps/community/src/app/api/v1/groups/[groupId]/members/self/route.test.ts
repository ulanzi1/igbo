// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockLeaveGroup = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/group-membership-service", () => ({
  leaveGroup: (...args: unknown[]) => mockLeaveGroup(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_LEAVE: { maxRequests: 10, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
    limit: 10,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { DELETE } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/members/self`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockLeaveGroup.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("DELETE /api/v1/groups/[groupId]/members/self", () => {
  it("returns 200 on successful leave", async () => {
    mockLeaveGroup.mockResolvedValue(undefined);

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.left).toBe(true);
    expect(mockLeaveGroup).toHaveBeenCalledWith(USER_ID, GROUP_ID);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 when creator tries to leave", async () => {
    mockLeaveGroup.mockRejectedValue(
      new ApiError({ status: 403, title: "Forbidden", detail: "Group creators cannot leave" }),
    );

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
  });

  it("returns 404 when not a member", async () => {
    mockLeaveGroup.mockRejectedValue(new ApiError({ status: 404, title: "Not Found" }));

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(404);
  });
});
