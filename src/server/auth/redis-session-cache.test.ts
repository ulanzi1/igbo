// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ get: mockGet, set: mockSet, del: mockDel }),
}));

import {
  cacheSession,
  getCachedSession,
  evictCachedSession,
  evictAllUserSessions,
} from "./redis-session-cache";
import type { AuthSession } from "@/db/schema/auth-sessions";

const mockSession: AuthSession = {
  id: "sess-1",
  sessionToken: "token-abc",
  userId: "user-1",
  expires: new Date("2030-01-01"),
  deviceName: "Chrome on macOS",
  deviceIp: "1.2.3.4",
  deviceLocation: null,
  lastActiveAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue("OK");
  mockGet.mockResolvedValue(null);
  mockDel.mockResolvedValue(1);
});

describe("cacheSession", () => {
  it("stores session JSON in Redis with TTL", async () => {
    await cacheSession(mockSession, 86400);
    expect(mockSet).toHaveBeenCalledWith(
      `session:${mockSession.sessionToken}`,
      expect.any(String),
      "EX",
      86400,
    );
  });

  it("does not throw on Redis failure", async () => {
    mockSet.mockRejectedValue(new Error("Redis down"));
    await expect(cacheSession(mockSession, 86400)).resolves.toBeUndefined();
  });
});

describe("getCachedSession", () => {
  it("returns null when not cached", async () => {
    const result = await getCachedSession("nonexistent");
    expect(result).toBeNull();
  });

  it("returns parsed session with Date objects", async () => {
    mockGet.mockResolvedValue(JSON.stringify(mockSession));
    const result = await getCachedSession(mockSession.sessionToken);
    expect(result).not.toBeNull();
    expect(result?.expires).toBeInstanceOf(Date);
    expect(result?.lastActiveAt).toBeInstanceOf(Date);
  });

  it("returns null on parse failure", async () => {
    mockGet.mockResolvedValue("not-json");
    const result = await getCachedSession("token");
    expect(result).toBeNull();
  });
});

describe("evictCachedSession", () => {
  it("deletes the session key from Redis", async () => {
    await evictCachedSession("token-abc");
    expect(mockDel).toHaveBeenCalledWith("session:token-abc");
  });

  it("does not throw on Redis failure", async () => {
    mockDel.mockRejectedValue(new Error("Redis down"));
    await expect(evictCachedSession("token")).resolves.toBeUndefined();
  });
});

describe("evictAllUserSessions", () => {
  it("deletes all session keys", async () => {
    await evictAllUserSessions(["tok1", "tok2"]);
    expect(mockDel).toHaveBeenCalledWith("session:tok1", "session:tok2");
  });

  it("does nothing for empty array", async () => {
    await evictAllUserSessions([]);
    expect(mockDel).not.toHaveBeenCalled();
  });
});
