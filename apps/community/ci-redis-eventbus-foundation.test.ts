// @vitest-environment node
/**
 * Infrastructure tests — P-0.6 Redis & Event Bus Foundation.
 * Validates that all required files exist, shared config is correct,
 * and key integration wiring is in place.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");
const APP_ROOT = resolve(__dirname, ".");

// ─────────────────────────────────────────────────────────
// Shared event types (@igbo/config/events)
// ─────────────────────────────────────────────────────────

describe("@igbo/config/events — shared event types", () => {
  const eventsPath = resolve(ROOT, "packages/config/src/events.ts");
  const eventsSource = existsSync(eventsPath) ? readFileSync(eventsPath, "utf-8") : "";

  it("packages/config/src/events.ts exists", () => {
    expect(existsSync(eventsPath)).toBe(true);
  });

  it('packages/config/package.json has "./events" export entry', () => {
    const pkgPath = resolve(ROOT, "packages/config/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const exports = pkg.exports as Record<string, unknown> | undefined;
    expect(exports?.["./events"]).toBeDefined();
  });

  it("PortalEventMap includes job.published", () => {
    expect(eventsSource).toContain('"job.published"');
  });

  it("PortalEventMap includes job.updated", () => {
    expect(eventsSource).toContain('"job.updated"');
  });

  it("PortalEventMap includes job.closed", () => {
    expect(eventsSource).toContain('"job.closed"');
  });

  it("PortalEventMap includes application.submitted", () => {
    expect(eventsSource).toContain('"application.submitted"');
  });

  it("PortalEventMap includes application.status_changed", () => {
    expect(eventsSource).toContain('"application.status_changed"');
  });

  it("PortalEventMap includes application.withdrawn", () => {
    expect(eventsSource).toContain('"application.withdrawn"');
  });

  it("exports COMMUNITY_CROSS_APP_EVENTS with community event names", () => {
    expect(eventsSource).toContain("COMMUNITY_CROSS_APP_EVENTS");
    expect(eventsSource).toContain("user.verified");
    expect(eventsSource).toContain("user.role_changed");
    expect(eventsSource).toContain("user.suspended");
  });

  it("exports EVENT_DEDUP_KEY and EVENT_DEDUP_TTL_SECONDS", () => {
    expect(eventsSource).toContain("EVENT_DEDUP_KEY");
    expect(eventsSource).toContain("EVENT_DEDUP_TTL_SECONDS");
  });

  it("exports CommunityCrossAppEventMap with typed payloads for inbound community events", () => {
    expect(eventsSource).toContain("CommunityCrossAppEventMap");
    expect(eventsSource).toContain("PortalAllEventMap");
    expect(eventsSource).toContain("PortalAllEventName");
  });
});

// ─────────────────────────────────────────────────────────
// Portal Redis client
// ─────────────────────────────────────────────────────────

describe("portal Redis client", () => {
  it("apps/portal/src/lib/redis.ts exists", () => {
    const path = resolve(ROOT, "apps/portal/src/lib/redis.ts");
    expect(existsSync(path)).toBe(true);
  });

  it("portal package.json has ioredis dependency", () => {
    const pkgPath = resolve(ROOT, "apps/portal/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const deps = pkg.dependencies as Record<string, string> | undefined;
    expect(deps?.["ioredis"]).toBeDefined();
  });

  it("portal redis.ts uses igbo:portal: connection name prefix", () => {
    const source = readFileSync(resolve(ROOT, "apps/portal/src/lib/redis.ts"), "utf-8");
    expect(source).toContain("igbo:portal:");
  });
});

// ─────────────────────────────────────────────────────────
// Portal EventBus + event bridge
// ─────────────────────────────────────────────────────────

describe("portal EventBus", () => {
  it("apps/portal/src/services/event-bus.ts exists", () => {
    const path = resolve(ROOT, "apps/portal/src/services/event-bus.ts");
    expect(existsSync(path)).toBe(true);
  });

  it("portal EventBus imports from @igbo/config/events", () => {
    const source = readFileSync(resolve(ROOT, "apps/portal/src/services/event-bus.ts"), "utf-8");
    expect(source).toContain("@igbo/config/events");
  });

  it("portal EventBus exports portalEventBus singleton", () => {
    const source = readFileSync(resolve(ROOT, "apps/portal/src/services/event-bus.ts"), "utf-8");
    expect(source).toContain("export const portalEventBus");
  });
});

describe("portal event bridge", () => {
  it("apps/portal/src/services/event-bridge.ts exists", () => {
    const path = resolve(ROOT, "apps/portal/src/services/event-bridge.ts");
    expect(existsSync(path)).toBe(true);
  });

  it("portal event-bridge imports COMMUNITY_CROSS_APP_EVENTS from @igbo/config/events", () => {
    const source = readFileSync(resolve(ROOT, "apps/portal/src/services/event-bridge.ts"), "utf-8");
    expect(source).toContain("COMMUNITY_CROSS_APP_EVENTS");
    expect(source).toContain("@igbo/config/events");
  });

  it("portal event-bridge uses emitLocal (not emit) to prevent Redis re-publish", () => {
    const source = readFileSync(resolve(ROOT, "apps/portal/src/services/event-bridge.ts"), "utf-8");
    expect(source).toContain("emitLocal");
  });
});

// ─────────────────────────────────────────────────────────
// Realtime config — port + namespace
// ─────────────────────────────────────────────────────────

describe("realtime config — port and namespace", () => {
  const realtimePath = resolve(ROOT, "packages/config/src/realtime.ts");
  const realtimeSource = readFileSync(realtimePath, "utf-8");

  it("NAMESPACE_PORTAL is exported from @igbo/config/realtime", () => {
    expect(realtimeSource).toContain("NAMESPACE_PORTAL");
    expect(realtimeSource).toContain('"/portal"');
  });

  it("REALTIME_PORT default is 3002 (not 3001 — avoids portal port conflict)", () => {
    expect(realtimeSource).toContain("3002");
    // Confirm default is not 3001 (which conflicts with portal Next.js server)
    expect(realtimeSource).not.toMatch(/"3001"/);
  });

  it("portal namespace file exists at apps/community/src/server/realtime/namespaces/portal.ts", () => {
    const path = resolve(APP_ROOT, "src/server/realtime/namespaces/portal.ts");
    expect(existsSync(path)).toBe(true);
  });

  it("realtime index.ts registers the portal namespace", () => {
    const source = readFileSync(resolve(APP_ROOT, "src/server/realtime/index.ts"), "utf-8");
    expect(source).toContain("setupPortalNamespace");
  });
});

// ─────────────────────────────────────────────────────────
// CORS multi-origin
// ─────────────────────────────────────────────────────────

describe("REALTIME_CORS_ORIGINS — multi-origin array", () => {
  const realtimePath = resolve(ROOT, "packages/config/src/realtime.ts");
  const realtimeSource = readFileSync(realtimePath, "utf-8");

  it("REALTIME_CORS_ORIGINS export exists (plural, array form)", () => {
    expect(realtimeSource).toContain("REALTIME_CORS_ORIGINS");
  });

  it("default CORS origins include localhost:3000 (community)", () => {
    expect(realtimeSource).toContain("localhost:3000");
  });

  it("default CORS origins include localhost:3001 (portal)", () => {
    // The default includes both origins for dev; portal runs on 3001
    expect(realtimeSource).toContain("localhost:3001");
  });

  it("CORS origins parsed via split (produces array not single string)", () => {
    expect(realtimeSource).toContain(".split(");
  });
});
