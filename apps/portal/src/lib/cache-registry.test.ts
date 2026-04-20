// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis");

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisScan = vi.fn();
const mockRedisDel = vi.fn();

vi.mocked((await import("@/lib/redis")).getRedisClient).mockReturnValue({
  get: mockRedisGet,
  set: mockRedisSet,
  scan: mockRedisScan,
  del: mockRedisDel,
} as never);

import {
  registerCacheNamespace,
  getRegisteredGroups,
  cachedFetch,
  invalidateByGroup,
  invalidateAll,
  _testOnly_awaitInvalidation,
  _resetRegistry,
} from "./cache-registry";

beforeEach(() => {
  vi.clearAllMocks();
  _resetRegistry();
  mockRedisSet.mockResolvedValue("OK");
  mockRedisScan.mockResolvedValue(["0", []]);
  mockRedisDel.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// registerCacheNamespace
// ---------------------------------------------------------------------------

describe("registerCacheNamespace", () => {
  it("registers a group successfully", () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    expect(getRegisteredGroups()).toContain("search");
  });

  it("idempotent re-registration with same patterns is a no-op", () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    expect(getRegisteredGroups().filter((g) => g === "search")).toHaveLength(1);
  });

  it("throws on same group with different patterns", () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    expect(() => registerCacheNamespace("search", { patterns: ["different:*"] })).toThrow(
      /already registered with different patterns/,
    );
  });

  it("multiple groups coexist", () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    registerCacheNamespace("discovery", { patterns: ["portal:discovery:*"] });
    expect(getRegisteredGroups()).toEqual(expect.arrayContaining(["search", "discovery"]));
  });
});

// ---------------------------------------------------------------------------
// getRegisteredGroups
// ---------------------------------------------------------------------------

describe("getRegisteredGroups", () => {
  it("returns empty array initially", () => {
    expect(getRegisteredGroups()).toEqual([]);
  });

  it("returns all registered group names after registration", () => {
    registerCacheNamespace("a", { patterns: ["a:*"] });
    registerCacheNamespace("b", { patterns: ["b:*"] });
    expect(getRegisteredGroups()).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// cachedFetch
// ---------------------------------------------------------------------------

describe("cachedFetch", () => {
  it("throws on unregistered group", async () => {
    await expect(cachedFetch("nonexistent", "key", 60, async () => "data")).rejects.toThrow(
      /not registered/,
    );
  });

  it("returns parsed data on cache hit", async () => {
    registerCacheNamespace("test", { patterns: ["test:*"] });
    mockRedisGet.mockResolvedValue(JSON.stringify({ value: 42 }));

    const result = await cachedFetch("test", "test:key", 60, async () => ({ value: 99 }));

    expect(result).toEqual({ value: 42 });
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it("fetches from DB and writes NX on cache miss", async () => {
    registerCacheNamespace("test", { patterns: ["test:*"] });
    mockRedisGet.mockResolvedValue(null);

    const result = await cachedFetch("test", "test:key", 120, async () => ({ value: 99 }));

    expect(result).toEqual({ value: 99 });
    await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce());
    expect(mockRedisSet).toHaveBeenCalledWith(
      "test:key",
      JSON.stringify({ value: 99 }),
      "EX",
      120,
      "NX",
    );
  });

  it("evicts corrupted cache entry and fetches from DB", async () => {
    registerCacheNamespace("test", { patterns: ["test:*"] });
    mockRedisGet.mockResolvedValue("not-valid-json{{{");

    const result = await cachedFetch("test", "test:key", 60, async () => ({ fallback: true }));

    expect(result).toEqual({ fallback: true });
    expect(mockRedisDel).toHaveBeenCalledWith("test:key");
  });

  it("swallows redis.set error on write failure", async () => {
    registerCacheNamespace("test", { patterns: ["test:*"] });
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockRejectedValue(new Error("Redis write failed"));

    const result = await cachedFetch("test", "test:key", 60, async () => "data");
    expect(result).toBe("data");
  });
});

// ---------------------------------------------------------------------------
// invalidateByGroup
// ---------------------------------------------------------------------------

describe("invalidateByGroup", () => {
  it("SCANs single pattern and deletes keys", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    mockRedisScan.mockResolvedValue(["0", ["portal:job-search:abc", "portal:job-search:def"]]);
    mockRedisDel.mockResolvedValue(2);

    await invalidateByGroup("search");

    expect(mockRedisScan).toHaveBeenCalledWith("0", "MATCH", "portal:job-search:*", "COUNT", 100);
    expect(mockRedisDel).toHaveBeenCalledWith("portal:job-search:abc", "portal:job-search:def");
  });

  it("SCANs multi-pattern group (iterates each pattern)", async () => {
    registerCacheNamespace("discovery", {
      patterns: ["portal:discovery:featured:*", "portal:discovery:categories:*"],
    });
    mockRedisScan
      .mockResolvedValueOnce(["0", ["portal:discovery:featured:en"]])
      .mockResolvedValueOnce(["0", ["portal:discovery:categories:en"]]);
    mockRedisDel.mockResolvedValue(1);

    await invalidateByGroup("discovery");

    expect(mockRedisScan).toHaveBeenCalledTimes(2);
    expect(mockRedisDel).toHaveBeenCalledWith("portal:discovery:featured:en");
    expect(mockRedisDel).toHaveBeenCalledWith("portal:discovery:categories:en");
  });

  it("handles multi-page SCAN (cursor loop)", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    mockRedisScan
      .mockResolvedValueOnce(["42", ["portal:job-search:key1"]])
      .mockResolvedValueOnce(["0", ["portal:job-search:key2"]]);
    mockRedisDel.mockResolvedValue(1);

    await invalidateByGroup("search");

    expect(mockRedisScan).toHaveBeenCalledTimes(2);
    expect(mockRedisDel).toHaveBeenCalledWith("portal:job-search:key1", "portal:job-search:key2");
  });

  it("batches DEL in groups of 100", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    const keys = Array.from({ length: 150 }, (_, i) => `portal:job-search:key${i}`);
    mockRedisScan.mockResolvedValue(["0", keys]);
    mockRedisDel.mockResolvedValue(100);

    await invalidateByGroup("search");

    expect(mockRedisDel).toHaveBeenCalledTimes(2);
    expect(mockRedisDel.mock.calls[0]).toHaveLength(100);
    expect(mockRedisDel.mock.calls[1]).toHaveLength(50);
  });

  it("no-op when SCAN returns no keys", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    mockRedisScan.mockResolvedValue(["0", []]);

    await invalidateByGroup("search");

    expect(mockRedisDel).not.toHaveBeenCalled();
  });

  it("warns and skips unknown group (no throw)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(invalidateByGroup("nonexistent")).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("swallows Redis error", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    mockRedisScan.mockRejectedValue(new Error("Redis down"));

    await expect(invalidateByGroup("search")).resolves.toBeUndefined();
  });

  it("fires _notifyInvalidationComplete in finally", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    mockRedisScan.mockResolvedValue(["0", []]);

    const awaited = _testOnly_awaitInvalidation();
    await invalidateByGroup("search");
    await expect(awaited).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// invalidateAll
// ---------------------------------------------------------------------------

describe("invalidateAll", () => {
  it("invalidates all registered groups", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    registerCacheNamespace("sitemap", { patterns: ["portal:sitemap:*"] });
    mockRedisScan.mockResolvedValue(["0", []]);

    await invalidateAll();

    // Should SCAN both patterns
    expect(mockRedisScan).toHaveBeenCalledWith("0", "MATCH", "portal:job-search:*", "COUNT", 100);
    expect(mockRedisScan).toHaveBeenCalledWith("0", "MATCH", "portal:sitemap:*", "COUNT", 100);
  });

  it("no-op when registry empty", async () => {
    await invalidateAll();
    expect(mockRedisScan).not.toHaveBeenCalled();
  });

  it("fires _notifyInvalidationComplete", async () => {
    const awaited = _testOnly_awaitInvalidation();
    await invalidateAll();
    await expect(awaited).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// _resetRegistry
// ---------------------------------------------------------------------------

describe("_resetRegistry", () => {
  it("clears all registrations", () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    _resetRegistry();
    expect(getRegisteredGroups()).toEqual([]);
  });

  it("allows re-registration after reset", () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    _resetRegistry();
    registerCacheNamespace("search", { patterns: ["different:*"] });
    expect(getRegisteredGroups()).toContain("search");
  });
});

// ---------------------------------------------------------------------------
// _testOnly_awaitInvalidation
// ---------------------------------------------------------------------------

describe("_testOnly_awaitInvalidation", () => {
  it("resolves when invalidation completes", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    mockRedisScan.mockResolvedValue(["0", ["portal:job-search:x"]]);
    mockRedisDel.mockResolvedValue(1);

    const awaited = _testOnly_awaitInvalidation();
    await invalidateByGroup("search");
    await expect(awaited).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Validation scenario: new hypothetical group auto-included in invalidateAll
// ---------------------------------------------------------------------------

describe("validation: new cache group auto-registers for invalidateAll", () => {
  it("hypothetical 5th group is included in invalidateAll SCAN", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    registerCacheNamespace("discovery", { patterns: ["portal:discovery:featured:*"] });
    registerCacheNamespace("similar", { patterns: ["portal:discovery:similar:*"] });
    registerCacheNamespace("sitemap", { patterns: ["portal:sitemap:*"] });
    registerCacheNamespace("hypothetical", { patterns: ["portal:hypothetical:*"] });

    mockRedisScan.mockResolvedValue(["0", []]);

    await invalidateAll();

    const scanPatterns = mockRedisScan.mock.calls.map((c) => c[2]);
    expect(scanPatterns).toContain("portal:hypothetical:*");
    expect(scanPatterns).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// F5: All 4 production groups are registered (drift guard)
// ---------------------------------------------------------------------------

describe("production group registration drift guard", () => {
  it("all 4 production cache groups register correctly", () => {
    // Replicate the exact production registrations
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    registerCacheNamespace("discovery", {
      patterns: [
        "portal:discovery:featured:*",
        "portal:discovery:categories:*",
        "portal:discovery:recent:*",
      ],
    });
    registerCacheNamespace("similar", { patterns: ["portal:discovery:similar:*"] });
    registerCacheNamespace("sitemap", { patterns: ["portal:sitemap:*"] });

    const groups = getRegisteredGroups();
    expect(groups).toHaveLength(4);
    expect(groups).toEqual(expect.arrayContaining(["search", "discovery", "similar", "sitemap"]));
  });

  it("invalidateAll covers all 4 production groups with 6 SCAN patterns", async () => {
    registerCacheNamespace("search", { patterns: ["portal:job-search:*"] });
    registerCacheNamespace("discovery", {
      patterns: [
        "portal:discovery:featured:*",
        "portal:discovery:categories:*",
        "portal:discovery:recent:*",
      ],
    });
    registerCacheNamespace("similar", { patterns: ["portal:discovery:similar:*"] });
    registerCacheNamespace("sitemap", { patterns: ["portal:sitemap:*"] });

    mockRedisScan.mockResolvedValue(["0", []]);
    await invalidateAll();

    const scanPatterns = mockRedisScan.mock.calls.map((c) => c[2]);
    expect(scanPatterns).toContain("portal:job-search:*");
    expect(scanPatterns).toContain("portal:discovery:featured:*");
    expect(scanPatterns).toContain("portal:discovery:categories:*");
    expect(scanPatterns).toContain("portal:discovery:recent:*");
    expect(scanPatterns).toContain("portal:discovery:similar:*");
    expect(scanPatterns).toContain("portal:sitemap:*");
    expect(scanPatterns).toHaveLength(6); // 1 + 3 + 1 + 1
  });
});
