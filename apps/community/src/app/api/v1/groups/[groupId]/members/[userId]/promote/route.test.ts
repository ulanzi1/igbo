// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

const mockAssignGroupLeader = vi.fn();
vi.mock("@/services/group-service", () => ({
  assignGroupLeader: (...args: unknown[]) => mockAssignGroupLeader(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { GROUP_MANAGE: { maxRequests: 20, windowMs: 60_000 } },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000, limit: 20 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const TARGET_ID = "00000000-0000-4000-8000-000000000003";

const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/members/${TARGET_ID}/promote`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockAssignGroupLeader.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: ACTOR_ID, role: "MEMBER" });
});

describe("POST /api/v1/groups/[groupId]/members/[userId]/promote", () => {
  it("returns 201 with promoted:true on success", async () => {
    mockAssignGroupLeader.mockResolvedValue(undefined);

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.promoted).toBe(true);
    expect(mockAssignGroupLeader).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID, TARGET_ID);
  });

  it("returns 400 when groupId is not a valid UUID", async () => {
    const req = new Request(
      `https://localhost:3000/api/v1/groups/not-a-uuid/members/${TARGET_ID}/promote`,
      { method: "POST", headers: CSRF_HEADERS },
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is not a valid UUID", async () => {
    const req = new Request(
      `https://localhost:3000/api/v1/groups/${GROUP_ID}/members/not-a-uuid/promote`,
      { method: "POST", headers: CSRF_HEADERS },
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 when actor is not the group creator", async () => {
    mockAssignGroupLeader.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 404 when target is not an active member", async () => {
    mockAssignGroupLeader.mockRejectedValue(new ApiError({ title: "Not Found", status: 404 }));

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it("returns 422 when target tier is too low", async () => {
    mockAssignGroupLeader.mockRejectedValue(
      new ApiError({ title: "Unprocessable Entity", status: 422 }),
    );

    const req = new Request(BASE_URL, { method: "POST", headers: CSRF_HEADERS });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });
});
