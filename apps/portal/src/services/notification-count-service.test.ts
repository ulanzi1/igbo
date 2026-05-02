// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedisGet, mockRedisSet, mockRedisDel, mockGetPortalUnreadCount } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockGetPortalUnreadCount: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}));

vi.mock("@igbo/config/redis", () => ({
  createRedisKey: (...parts: string[]) => parts.join(":"),
}));

vi.mock("@igbo/db/queries/portal-notifications", () => ({
  getPortalUnreadCount: mockGetPortalUnreadCount,
}));

import { getCachedUnreadCount, invalidateUnreadCount } from "./notification-count-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCachedUnreadCount", () => {
  it("returns cached value on Redis hit (no DB call)", async () => {
    mockRedisGet.mockResolvedValue("7");

    const count = await getCachedUnreadCount("user-1");

    expect(count).toBe(7);
    expect(mockGetPortalUnreadCount).not.toHaveBeenCalled();
  });

  it("falls back to DB on cache miss and warms cache", async () => {
    mockRedisGet.mockResolvedValue(null);
    mockGetPortalUnreadCount.mockResolvedValue(3);
    mockRedisSet.mockResolvedValue("OK");

    const count = await getCachedUnreadCount("user-1");

    expect(count).toBe(3);
    expect(mockGetPortalUnreadCount).toHaveBeenCalledWith("user-1");
    expect(mockRedisSet).toHaveBeenCalledWith("portal:notif-unread:user-1", "3", "EX", 60);
  });

  it("falls back to DB when Redis throws (fail-open)", async () => {
    mockRedisGet.mockRejectedValue(new Error("Redis down"));
    mockGetPortalUnreadCount.mockResolvedValue(5);

    const count = await getCachedUnreadCount("user-1");

    expect(count).toBe(5);
    expect(mockGetPortalUnreadCount).toHaveBeenCalledWith("user-1");
  });

  it("returns correct count after mark-read invalidation (cache miss → DB)", async () => {
    mockRedisGet.mockResolvedValueOnce("10");
    expect(await getCachedUnreadCount("user-1")).toBe(10);

    mockRedisGet.mockResolvedValueOnce(null);
    mockGetPortalUnreadCount.mockResolvedValue(9);
    mockRedisSet.mockResolvedValue("OK");

    expect(await getCachedUnreadCount("user-1")).toBe(9);
  });

  it("returns correct count after new notification invalidation", async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetPortalUnreadCount.mockResolvedValue(1);
    mockRedisSet.mockResolvedValue("OK");

    const count = await getCachedUnreadCount("user-1");

    expect(count).toBe(1);
  });
});

describe("invalidateUnreadCount", () => {
  it("deletes the Redis cache key", async () => {
    mockRedisDel.mockResolvedValue(1);

    await invalidateUnreadCount("user-1");

    expect(mockRedisDel).toHaveBeenCalledWith("portal:notif-unread:user-1");
  });

  it("does not throw when Redis errors (fail-open)", async () => {
    mockRedisDel.mockRejectedValue(new Error("Redis down"));

    await expect(invalidateUnreadCount("user-1")).resolves.toBeUndefined();
  });
});
