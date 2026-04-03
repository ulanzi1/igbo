/**
 * Redis & Event Bus Foundation Integration Smoke Tests — P-0.6
 *
 * Tests the shared Redis namespace isolation and EventBus cross-app contracts.
 *
 * Static tests (always run): createRedisKey prefix logic, PortalEventMap structure.
 * Live tests (require Redis): Real SET/GET, pub/sub channel publish.
 *
 * Run live tests:
 *   REDIS_URL=redis://localhost:6379 pnpm --filter @igbo/integration-tests test
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const REDIS_URL = process.env.REDIS_URL;
const REDIS_RUNNING = !!REDIS_URL;

// ─────────────────────────────────────────────────────────
// Redis key namespace isolation — pure logic (no live Redis)
// ─────────────────────────────────────────────────────────

describe("createRedisKey — namespace isolation", () => {
  it("portal key has portal: prefix", async () => {
    const { createRedisKey } = await import("@igbo/config/redis");
    const key = createRedisKey("portal", "cache", "test-1");
    expect(key).toBe("portal:cache:test-1");
  });

  it("community key has community: prefix", async () => {
    const { createRedisKey } = await import("@igbo/config/redis");
    const key = createRedisKey("community", "cache", "test-1");
    expect(key).toBe("community:cache:test-1");
  });

  it("portal and community keys for the same domain+id are distinct", async () => {
    const { createRedisKey } = await import("@igbo/config/redis");
    const portalKey = createRedisKey("portal", "session", "u1");
    const communityKey = createRedisKey("community", "session", "u1");
    expect(portalKey).not.toBe(communityKey);
  });
});

// ─────────────────────────────────────────────────────────
// Shared event types — structure validation (no live services)
// ─────────────────────────────────────────────────────────

describe("@igbo/config/events — contract validation", () => {
  it("PORTAL_CROSS_APP_EVENTS contains expected portal events", async () => {
    const { PORTAL_CROSS_APP_EVENTS } = await import("@igbo/config/events");
    expect(PORTAL_CROSS_APP_EVENTS).toContain("job.published");
    expect(PORTAL_CROSS_APP_EVENTS).toContain("application.submitted");
    expect(PORTAL_CROSS_APP_EVENTS).toContain("application.status_changed");
  });

  it("COMMUNITY_CROSS_APP_EVENTS contains expected community events", async () => {
    const { COMMUNITY_CROSS_APP_EVENTS } = await import("@igbo/config/events");
    expect(COMMUNITY_CROSS_APP_EVENTS).toContain("user.verified");
    expect(COMMUNITY_CROSS_APP_EVENTS).toContain("user.role_changed");
    expect(COMMUNITY_CROSS_APP_EVENTS).toContain("user.suspended");
  });

  it("PORTAL_CROSS_APP_EVENTS and COMMUNITY_CROSS_APP_EVENTS have no overlap", async () => {
    const { PORTAL_CROSS_APP_EVENTS, COMMUNITY_CROSS_APP_EVENTS } =
      await import("@igbo/config/events");
    const portalSet = new Set(PORTAL_CROSS_APP_EVENTS);
    for (const event of COMMUNITY_CROSS_APP_EVENTS) {
      expect(portalSet.has(event as never)).toBe(false);
    }
  });

  it("createEventEnvelope() produces dedup-safe eventIds", async () => {
    const { createEventEnvelope } = await import("@igbo/config/events");
    const e1 = createEventEnvelope();
    const e2 = createEventEnvelope();
    expect(e1.eventId).not.toBe(e2.eventId);
  });
});

// ─────────────────────────────────────────────────────────
// Live Redis tests (require REDIS_URL env var)
// ─────────────────────────────────────────────────────────

describe.skipIf(!REDIS_RUNNING)("Live Redis — namespace isolation (requires REDIS_URL)", () => {
  it("portal SET/GET with namespaced key does not collide with community", async () => {
    const Redis = (await import("ioredis")).default;
    const { createRedisKey } = await import("@igbo/config/redis");

    const redis = new Redis(REDIS_URL!, { lazyConnect: false });
    try {
      const portalKey = createRedisKey("portal", "cache", `test-${Date.now()}`);
      const communityKey = createRedisKey("community", "cache", `test-${Date.now()}`);

      await redis.set(portalKey, "portal-value", "EX", 60);
      await redis.set(communityKey, "community-value", "EX", 60);

      const portalVal = await redis.get(portalKey);
      const communityVal = await redis.get(communityKey);

      expect(portalVal).toBe("portal-value");
      expect(communityVal).toBe("community-value");
      expect(portalVal).not.toBe(communityVal);

      // Cleanup
      await redis.del(portalKey, communityKey);
    } finally {
      await redis.quit();
    }
  });
});
