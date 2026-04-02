// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockGetRedisClient = vi.fn(() => ({ get: mockGet, set: mockSet, del: mockDel }));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

const mockGetRecommendedGroups = vi.fn();

vi.mock("@/db/queries/recommendations", () => ({
  getRecommendedGroups: (...args: unknown[]) => mockGetRecommendedGroups(...args),
}));

// server-only stub
vi.mock("server-only", () => ({}));

import {
  getRecommendedGroupsForUser,
  invalidateRecommendationCache,
} from "./recommendation-service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUPS = [
  {
    id: "g1",
    name: "Test Group",
    description: null,
    bannerUrl: null,
    visibility: "public",
    joinType: "open",
    memberCount: 5,
    score: 2,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRecommendedGroupsForUser", () => {
  it("returns cached data without DB call on cache hit", async () => {
    mockGet.mockResolvedValue(JSON.stringify(GROUPS));
    const result = await getRecommendedGroupsForUser(USER_ID);
    expect(result).toEqual(GROUPS);
    expect(mockGetRecommendedGroups).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("calls DB and caches on cache miss", async () => {
    mockGet.mockResolvedValue(null);
    mockGetRecommendedGroups.mockResolvedValue(GROUPS);
    mockSet.mockResolvedValue("OK");

    const result = await getRecommendedGroupsForUser(USER_ID);
    expect(result).toEqual(GROUPS);
    expect(mockGetRecommendedGroups).toHaveBeenCalledWith(USER_ID, 5);
    expect(mockSet).toHaveBeenCalledWith(
      `recommendations:groups:${USER_ID}`,
      JSON.stringify(GROUPS),
      "EX",
      43200,
    );
  });

  it("falls back to DB query when Redis read throws", async () => {
    mockGetRedisClient.mockImplementationOnce(() => {
      throw new Error("Redis connection refused");
    });
    // Second call for redis.set should also fail gracefully
    mockGetRedisClient.mockImplementationOnce(() => {
      throw new Error("Redis connection refused");
    });
    mockGetRecommendedGroups.mockResolvedValue(GROUPS);

    const result = await getRecommendedGroupsForUser(USER_ID);
    expect(result).toEqual(GROUPS);
    expect(mockGetRecommendedGroups).toHaveBeenCalledWith(USER_ID, 5);
  });

  it("does not double-call DB when DB throws (no Redis masking)", async () => {
    mockGet.mockResolvedValue(null); // cache miss
    mockGetRecommendedGroups.mockRejectedValue(new Error("DB is down"));

    await expect(getRecommendedGroupsForUser(USER_ID)).rejects.toThrow("DB is down");
    expect(mockGetRecommendedGroups).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateRecommendationCache", () => {
  it("calls redis.del with the correct key", async () => {
    mockDel.mockResolvedValue(1);
    await invalidateRecommendationCache(USER_ID);
    expect(mockDel).toHaveBeenCalledWith(`recommendations:groups:${USER_ID}`);
  });

  it("does not throw when Redis fails", async () => {
    mockDel.mockRejectedValue(new Error("Redis error"));
    await expect(invalidateRecommendationCache(USER_ID)).resolves.toBeUndefined();
  });
});
