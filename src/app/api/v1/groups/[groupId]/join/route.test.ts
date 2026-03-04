// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockJoinOpenGroup = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/group-membership-service", () => ({
  joinOpenGroup: (...args: unknown[]) => mockJoinOpenGroup(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_JOIN: { maxRequests: 10, windowMs: 60_000 },
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

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/join`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockJoinOpenGroup.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("POST /api/v1/groups/[groupId]/join", () => {
  it("returns 201 on successful join", async () => {
    mockJoinOpenGroup.mockResolvedValue({ role: "member", status: "active" });

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.member).toEqual({ role: "member", status: "active" });
    expect(mockJoinOpenGroup).toHaveBeenCalledWith(USER_ID, GROUP_ID);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 404 when group not found", async () => {
    mockJoinOpenGroup.mockRejectedValue(
      new ApiError({ status: 404, title: "Not Found", detail: "Group not found" }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it("returns 422 when group requires approval", async () => {
    mockJoinOpenGroup.mockRejectedValue(
      new ApiError({ status: 422, title: "Unprocessable Entity" }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });

  it("returns 422 when membership limit reached", async () => {
    mockJoinOpenGroup.mockRejectedValue(
      new ApiError({ status: 422, title: "Unprocessable Entity", detail: "limit reached" }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });

  it("returns 201 with existing membership when already an active member (idempotent)", async () => {
    // Service returns no-op result for already-active members (idempotent join)
    mockJoinOpenGroup.mockResolvedValue({ role: "member", status: "active" });

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.member).toEqual({ role: "member", status: "active" });
  });
});
