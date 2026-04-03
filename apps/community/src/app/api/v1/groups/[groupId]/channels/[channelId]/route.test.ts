// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockDeleteChannel = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/group-channel-service", () => ({
  deleteChannel: (...args: unknown[]) => mockDeleteChannel(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_CHANNEL: { maxRequests: 5, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000, limit: 10 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { DELETE } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000002";
const CHANNEL_ID = "00000000-0000-4000-8000-000000000003";
const BASE_URL = `https://localhost:3000/api/v1/groups/${GROUP_ID}/channels/${CHANNEL_ID}`;
const CSRF_HEADERS = { Host: "localhost:3000", Origin: "https://localhost:3000" };

beforeEach(() => {
  mockRequireAuthenticatedSession.mockReset();
  mockDeleteChannel.mockReset();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
});

describe("DELETE /api/v1/groups/[groupId]/channels/[channelId]", () => {
  it("returns 204 when leader deletes a non-default channel", async () => {
    mockDeleteChannel.mockResolvedValue(undefined);

    const req = new Request(BASE_URL, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(204);
    expect(mockDeleteChannel).toHaveBeenCalledWith(USER_ID, GROUP_ID, CHANNEL_ID);
  });

  it("returns 403 when member tries to delete", async () => {
    mockDeleteChannel.mockRejectedValue(
      new ApiError({ status: 403, title: "Forbidden", detail: "Only leaders can delete channels" }),
    );

    const req = new Request(BASE_URL, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
  });

  it("returns 403 when trying to delete the default channel", async () => {
    mockDeleteChannel.mockRejectedValue(
      new ApiError({
        status: 403,
        title: "Forbidden",
        detail: "Cannot delete the General channel",
      }),
    );

    const req = new Request(BASE_URL, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
  });

  it("returns 404 when channel not found", async () => {
    mockDeleteChannel.mockRejectedValue(
      new ApiError({ status: 404, title: "Not Found", detail: "Channel not found" }),
    );

    const req = new Request(BASE_URL, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );

    const req = new Request(BASE_URL, {
      method: "DELETE",
      headers: CSRF_HEADERS,
    });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
  });
});
