// @vitest-environment node
/**
 * Resilience & Graceful Degradation Infrastructure tests (Story 12.5)
 * Validates maintenance page structure, i18n completeness, middleware patterns,
 * and service-health module exports.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, ".");
const SRC = resolve(ROOT, "src");

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.1 / 7.2 — Maintenance page structure
// ─────────────────────────────────────────────────────────────────────────────

describe("Maintenance page — static 503 page (Tasks 7.1, 7.2)", () => {
  const maintenancePagePath = resolve(SRC, "app/[locale]/maintenance/page.tsx");
  let content = "";

  beforeAll(() => {
    if (existsSync(maintenancePagePath)) {
      content = readFileSync(maintenancePagePath, "utf-8");
    }
  });

  it("maintenance page exists at correct path", () => {
    expect(existsSync(maintenancePagePath)).toBe(true);
  });

  it("maintenance page does NOT import from @/lib/auth", () => {
    // CRITICAL: must work without auth services during maintenance
    expect(content).not.toMatch(/from ['"]@\/lib\/auth['"]/);
    expect(content).not.toMatch(/from ['"]@\/lib\/admin-auth['"]/);
  });

  it("maintenance page does NOT import from @/db", () => {
    // CRITICAL: must work without DB during maintenance
    expect(content).not.toMatch(/from ['"]@\/db['"]/);
    expect(content).not.toMatch(/from ['"]@\/db\//);
  });

  it("maintenance page does NOT import any server-side service", () => {
    // Should not import any service that might fail during maintenance
    expect(content).not.toMatch(/from ['"]@\/services\//);
  });

  it("maintenance page has bilingual support", () => {
    // Both EN and IG locale strings hardcoded
    expect(content).toMatch(/Scheduled Maintenance/);
    expect(content).toMatch(/Nhazigharị/);
  });

  it("maintenance page renders as standard component (no nested html/body)", () => {
    expect(content).not.toMatch(/<html/);
    expect(content).not.toMatch(/<body/);
    expect(content).toMatch(/minHeight.*100vh/);
  });

  it("maintenance page has OBIGBO logo or branding", () => {
    expect(content).toMatch(/OBIGBO/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.3 — i18n completeness for all new keys
// ─────────────────────────────────────────────────────────────────────────────

import enMessages from "./messages/en.json";
import igMessages from "./messages/ig.json";

describe("i18n — new resilience keys present in both locales (Task 7.3)", () => {
  // Reconnection keys
  it("en: Shell.socketReconnecting", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Shell?.socketReconnecting,
    ).toBeDefined();
  });
  it("en: Shell.socketReconnected", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Shell?.socketReconnected,
    ).toBeDefined();
  });
  it("en: Shell.socketConnectionLost", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Shell?.socketConnectionLost,
    ).toBeDefined();
  });
  it("en: Shell.socketRetry", () => {
    expect((enMessages as Record<string, Record<string, string>>).Shell?.socketRetry).toBeDefined();
  });

  // Service degradation keys
  it("en: Shell.chatUnavailable", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Shell?.chatUnavailable,
    ).toBeDefined();
  });
  it("en: Shell.videoUnavailable", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Shell?.videoUnavailable,
    ).toBeDefined();
  });

  // Maintenance keys
  it("en: Shell.maintenanceScheduled", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Shell?.maintenanceScheduled,
    ).toBeDefined();
  });
  it("en: Shell.maintenanceDuration", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Shell?.maintenanceDuration,
    ).toBeDefined();
  });

  // Maintenance page keys
  it("en: Maintenance.title", () => {
    expect((enMessages as Record<string, Record<string, string>>).Maintenance?.title).toBeDefined();
  });
  it("en: Maintenance.message", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Maintenance?.message,
    ).toBeDefined();
  });
  it("en: Maintenance.apology", () => {
    expect(
      (enMessages as Record<string, Record<string, string>>).Maintenance?.apology,
    ).toBeDefined();
  });

  // Igbo counterparts
  it("ig: Shell.socketReconnecting", () => {
    expect(
      (igMessages as Record<string, Record<string, string>>).Shell?.socketReconnecting,
    ).toBeDefined();
  });
  it("ig: Shell.chatUnavailable", () => {
    expect(
      (igMessages as Record<string, Record<string, string>>).Shell?.chatUnavailable,
    ).toBeDefined();
  });
  it("ig: Shell.maintenanceScheduled", () => {
    expect(
      (igMessages as Record<string, Record<string, string>>).Shell?.maintenanceScheduled,
    ).toBeDefined();
  });
  it("ig: Maintenance.title", () => {
    expect((igMessages as Record<string, Record<string, string>>).Maintenance?.title).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.4 — Middleware maintenance mode path handling
// ─────────────────────────────────────────────────────────────────────────────

describe("Middleware — maintenance mode path handling (Task 7.4)", () => {
  const middlewarePath = resolve(SRC, "middleware.ts");
  let content = "";

  beforeAll(() => {
    if (existsSync(middlewarePath)) {
      content = readFileSync(middlewarePath, "utf-8");
    }
  });

  it("middleware.ts contains MAINTENANCE_MODE env var check", () => {
    expect(content).toContain('MAINTENANCE_MODE === "true"');
  });

  it("middleware.ts exempts admin paths from maintenance redirect", () => {
    expect(content).toContain("isAdminPath");
  });

  it("middleware.ts exempts maintenance page itself from redirect", () => {
    expect(content).toContain("isMaintenancePage");
  });

  it("middleware.ts sets Retry-After header on maintenance redirect", () => {
    expect(content).toContain("Retry-After");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.5 — service-health module exports
// ─────────────────────────────────────────────────────────────────────────────

describe("service-health module — exports (Task 7.5)", () => {
  const serviceHealthPath = resolve(SRC, "lib/service-health.ts");
  let content = "";

  beforeAll(() => {
    if (existsSync(serviceHealthPath)) {
      content = readFileSync(serviceHealthPath, "utf-8");
    }
  });

  it("service-health.ts exists", () => {
    expect(existsSync(serviceHealthPath)).toBe(true);
  });

  it("exports useServiceHealth hook", () => {
    expect(content).toContain("export function useServiceHealth");
  });

  it("exports ServiceHealth interface", () => {
    expect(content).toContain("ServiceHealth");
    expect(content).toContain("chatAvailable");
    expect(content).toContain("videoAvailable");
    expect(content).toContain("degradedServices");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: API middleware maintenance mode
// ─────────────────────────────────────────────────────────────────────────────

describe("API middleware — maintenance mode enforcement (Task 7.4)", () => {
  const apiMiddlewarePath = resolve(SRC, "server/api/middleware.ts");
  let content = "";

  beforeAll(() => {
    if (existsSync(apiMiddlewarePath)) {
      content = readFileSync(apiMiddlewarePath, "utf-8");
    }
  });

  it("withApiHandler checks MAINTENANCE_MODE env var", () => {
    expect(content).toContain('MAINTENANCE_MODE === "true"');
  });

  it("withApiHandler exempts /api/v1/health from maintenance", () => {
    expect(content).toContain("/api/v1/health");
  });

  it("withApiHandler exempts /api/v1/maintenance-status from maintenance", () => {
    expect(content).toContain("/api/v1/maintenance-status");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: SocketProvider has Infinity reconnection attempts
// ─────────────────────────────────────────────────────────────────────────────

describe("SocketProvider — reconnection configuration", () => {
  const socketProviderPath = resolve(SRC, "providers/SocketProvider.tsx");
  let content = "";

  beforeAll(() => {
    if (existsSync(socketProviderPath)) {
      content = readFileSync(socketProviderPath, "utf-8");
    }
  });

  it("SocketProvider.tsx exists", () => {
    expect(existsSync(socketProviderPath)).toBe(true);
  });

  it("reconnectionAttempts is set to Infinity", () => {
    expect(content).toContain("reconnectionAttempts: Infinity");
  });

  it("exports connectionPhase in SocketContextValue", () => {
    expect(content).toContain("connectionPhase");
  });

  it("emits sync:request on reconnect for chat namespace with lastReceivedAt", () => {
    expect(content).toContain("sync:request");
    expect(content).toContain("lastReceivedAt");
  });

  it("emits sync:request on reconnect for notifications namespace with lastTimestamp", () => {
    expect(content).toContain("lastTimestamp");
  });
});
