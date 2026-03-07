// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

const mockSetQuietHours = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockIsUserInQuietHours = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock("@/db/queries/notification-preferences", () => ({
  setQuietHours: (...args: unknown[]) => mockSetQuietHours(...args),
  isUserInQuietHours: (...args: unknown[]) => mockIsUserInQuietHours(...args),
}));

const mockRedisSet = vi.hoisted(() => vi.fn().mockResolvedValue("OK"));
const mockRedisDel = vi.hoisted(() => vi.fn().mockResolvedValue(1));
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ set: mockRedisSet, del: mockRedisDel }),
}));

vi.mock("@/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    DATABASE_URL: "postgres://localhost/test",
    DATABASE_POOL_SIZE: 1,
  },
}));

import { PUT, DELETE } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/v1/user/notification-preferences/quiet-hours", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Host: "localhost", Origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest() {
  return new Request("http://localhost/api/v1/user/notification-preferences/quiet-hours", {
    method: "DELETE",
    headers: { Host: "localhost", Origin: "http://localhost" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
  mockSetQuietHours.mockResolvedValue(undefined);
  mockIsUserInQuietHours.mockResolvedValue(false);
  mockRedisSet.mockResolvedValue("OK");
  mockRedisDel.mockResolvedValue(1);
});

describe("PUT /api/v1/user/notification-preferences/quiet-hours", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));
    const res = await PUT(
      makePutRequest({
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "UTC",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("saves quiet hours and returns ok:true", async () => {
    const res = await PUT(
      makePutRequest({
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "Africa/Lagos",
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ok).toBe(true);
    expect(mockSetQuietHours).toHaveBeenCalledWith("user-1", "22:00", "08:00", "Africa/Lagos");
  });

  it("sets Redis DnD key when currently in quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(true);
    await PUT(
      makePutRequest({
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "UTC",
      }),
    );
    expect(mockRedisSet).toHaveBeenCalledWith("dnd:user-1", "1", { ex: 5400 });
  });

  it("clears Redis DnD key when not currently in quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(false);
    await PUT(
      makePutRequest({
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "UTC",
      }),
    );
    expect(mockRedisDel).toHaveBeenCalledWith("dnd:user-1");
  });

  it("returns 400 for invalid time format", async () => {
    const res = await PUT(
      makePutRequest({
        quietHoursStart: "22:00:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "UTC",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/user/notification-preferences/quiet-hours", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(401);
  });

  it("clears quiet hours and Redis key, returns ok:true", async () => {
    const res = await DELETE(makeDeleteRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ok).toBe(true);
    expect(mockSetQuietHours).toHaveBeenCalledWith("user-1", null, null, "UTC");
    expect(mockRedisDel).toHaveBeenCalledWith("dnd:user-1");
  });
});
