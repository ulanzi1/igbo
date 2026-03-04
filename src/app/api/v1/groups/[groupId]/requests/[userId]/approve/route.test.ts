// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockApproveJoinRequest = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/group-membership-service", () => ({
  approveJoinRequest: (...args: unknown[]) => mockApproveJoinRequest(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_APPROVE_REJECT: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 19,
    resetAt: Date.now() + 60_000,
    limit: 20,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const LEADER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const MEMBER_ID = "00000000-0000-4000-8000-000000000003";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/requests/${MEMBER_ID}/approve`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockApproveJoinRequest.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: LEADER_ID, role: "MEMBER" });
});

describe("POST /api/v1/groups/[groupId]/requests/[userId]/approve", () => {
  it("returns 200 on successful approval", async () => {
    mockApproveJoinRequest.mockResolvedValue(undefined);

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.approved).toBe(true);
    expect(mockApproveJoinRequest).toHaveBeenCalledWith(LEADER_ID, GROUP_ID, MEMBER_ID);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not a leader", async () => {
    mockApproveJoinRequest.mockRejectedValue(new ApiError({ status: 403, title: "Forbidden" }));

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 404 when no pending request found", async () => {
    mockApproveJoinRequest.mockRejectedValue(new ApiError({ status: 404, title: "Not Found" }));

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it("returns 422 when membership limit reached at approval time", async () => {
    mockApproveJoinRequest.mockRejectedValue(
      new ApiError({ status: 422, title: "Unprocessable Entity" }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });
});
