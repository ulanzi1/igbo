// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

const mockArchiveGroup = vi.fn();
vi.mock("@/services/group-service", () => ({
  archiveGroup: (...args: unknown[]) => mockArchiveGroup(...args),
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

import { DELETE } from "./route";
import { ApiError } from "@/lib/api-error";

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";

const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/archive`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockArchiveGroup.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: ACTOR_ID, role: "MEMBER" });
});

describe("DELETE /api/v1/groups/[groupId]/archive", () => {
  it("returns 200 with archived:true on success", async () => {
    mockArchiveGroup.mockResolvedValue(undefined);

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archived).toBe(true);
    expect(mockArchiveGroup).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID);
  });

  it("returns 400 when groupId is not a valid UUID", async () => {
    const req = new Request(`https://localhost:3000/api/v1/groups/not-a-uuid/archive`, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 when actor is not creator or admin", async () => {
    mockArchiveGroup.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
  });

  it("returns 404 when group not found", async () => {
    mockArchiveGroup.mockRejectedValue(new ApiError({ title: "Not Found", status: 404 }));

    const req = new Request(BASE_URL, { method: "DELETE", headers: CSRF_HEADERS });
    const res = await DELETE(req);

    expect(res.status).toBe(404);
  });
});
