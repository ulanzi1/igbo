import { describe, it, expect } from "vitest";
import { createRedisKey, REDIS_TTL, REDIS_DOMAIN } from "./redis";

describe("createRedisKey", () => {
  it("creates a community-namespaced key", () => {
    expect(createRedisKey("community", "session", "abc")).toBe("community:session:abc");
  });

  it("creates a portal-namespaced key", () => {
    expect(createRedisKey("portal", "session", "abc")).toBe("portal:session:abc");
  });

  it("isolates namespaces — same domain+id, different app", () => {
    const communityKey = createRedisKey("community", "session", "user-123");
    const portalKey = createRedisKey("portal", "session", "user-123");
    expect(communityKey).not.toBe(portalKey);
    expect(communityKey).toBe("community:session:user-123");
    expect(portalKey).toBe("portal:session:user-123");
  });

  it("handles composite IDs", () => {
    expect(createRedisKey("community", "cache", "conv-1:user-2")).toBe(
      "community:cache:conv-1:user-2",
    );
  });

  it("handles dedup domain with sub-segments in id", () => {
    expect(createRedisKey("portal", "dedup", "notif:app-submitted:app-123")).toBe(
      "portal:dedup:notif:app-submitted:app-123",
    );
  });

  it("handles throttle domain with multi-segment id", () => {
    expect(createRedisKey("portal", "throttle", "msg:u1:u2:app-1")).toBe(
      "portal:throttle:msg:u1:u2:app-1",
    );
  });
});

describe("REDIS_TTL", () => {
  it("exports expected domain TTL constants", () => {
    expect(REDIS_TTL.session).toBe(86_400);
    expect(REDIS_TTL.cache).toBe(600);
    expect(REDIS_TTL.dedup).toBe(900);
    expect(REDIS_TTL.throttle).toBe(30);
    expect(REDIS_TTL.rate).toBe(60);
    expect(REDIS_TTL.delivered).toBe(86_400);
  });

  it("all TTL values are positive integers", () => {
    for (const [, value] of Object.entries(REDIS_TTL)) {
      expect(value).toBeGreaterThan(0);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("REDIS_DOMAIN", () => {
  it("exports all 6 core domain constants with values equal to their key names", () => {
    expect(Object.keys(REDIS_DOMAIN)).toEqual(
      expect.arrayContaining(["session", "cache", "dedup", "throttle", "rate", "delivered"]),
    );
    expect(Object.keys(REDIS_DOMAIN)).toHaveLength(6);
    expect(REDIS_DOMAIN.session).toBe("session");
    expect(REDIS_DOMAIN.cache).toBe("cache");
    expect(REDIS_DOMAIN.dedup).toBe("dedup");
    expect(REDIS_DOMAIN.throttle).toBe("throttle");
    expect(REDIS_DOMAIN.rate).toBe("rate");
    expect(REDIS_DOMAIN.delivered).toBe("delivered");
  });
});

describe("createRedisKey — compile-time type assertions", () => {
  it("rejects unknown RedisApp at compile time (@ts-expect-error assertion)", () => {
    // @ts-expect-error — "unknown-app" is not assignable to RedisApp
    const key = createRedisKey("unknown-app", "cache", "id");
    // Runtime: string concat still works; TypeScript rejects above at compile time
    expect(typeof key).toBe("string");
  });

  it("rejects unknown RedisDomain at compile time (@ts-expect-error assertion)", () => {
    // @ts-expect-error — "unknown-domain" is not assignable to RedisDomain
    const key = createRedisKey("community", "unknown-domain", "id");
    // Runtime: string concat still works; TypeScript rejects above at compile time
    expect(typeof key).toBe("string");
  });
});
