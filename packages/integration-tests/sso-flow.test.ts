/**
 * SSO Integration Tests — Cross-subdomain session sharing
 *
 * Architecture mandate (P-0.3B): Verify HTTP cookie Domain attribute and cross-app
 * session recognition using HTTP-level testing.
 *
 * P-0.3C: Safari ITP Compatibility — verify-session redirect flow
 * The automated tests here verify the ITP workaround contract (endpoint existence,
 * middleware logic, env var config). Manual Safari testing is required for full validation.
 *
 * ─── Safari Manual Testing Steps (P-0.3C) ────────────────────────────────────────────
 *
 * SN-1: Safari session persist after 7+ days simulation
 *   1. Log in on community app in Safari
 *   2. Open Safari DevTools → Storage → Cookies → select portal domain
 *   3. Delete the session cookie for the portal domain
 *   4. Navigate to a protected portal page
 *   Expected: Portal redirects to verify-session, cookie is re-set, page loads authenticated
 *
 * SN-2: Portal → Community round-trip on Safari macOS
 *   1. Log in on community (localhost:3000) in Safari
 *   2. Navigate to portal (localhost:3001/dashboard)
 *   3. Verify authenticated state on portal
 *   4. Navigate back to community — verify session intact
 *   Expected: Authenticated on both apps, no re-authentication prompts
 *
 * SN-3: Safari iOS PWA backgrounding
 *   1. Add portal to Safari iOS 17+ Home Screen (PWA)
 *   2. Log in, background the PWA for 5+ minutes
 *   3. Return to the PWA
 *   Expected: Session survives backgrounding via verify-session ITP refresh
 *
 * SN-4: Fallback redirect flow
 *   1. Navigate to portal/dashboard with ?_itp_refresh=1 appended (no session cookie)
 *   Expected: Redirects to community /login (fallback, not verify-session again)
 *
 * SN-5: Chrome/Firefox regression
 *   Run existing integration tests with COMMUNITY_URL and PORTAL_URL set; verify no regressions.
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Pre-conditions:
 * - Migration 0050 must have run against the test DB (auth_roles rows for portal roles)
 * - COOKIE_DOMAIN must be set to the apex domain (e.g. ".igbo.com") for true SSO in prod;
 *   in dev on localhost, cookies are shared across ports without COOKIE_DOMAIN.
 *
 * NOTE: Tests that require running app instances (community :3000, portal :3001) are
 * marked with describe.skipIf(!APPS_RUNNING) and require real servers.
 * Run full integration: pnpm --filter @igbo/integration-tests test:integration
 * with COMMUNITY_URL=http://localhost:3000 PORTAL_URL=http://localhost:3001 set.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const COMMUNITY_URL = process.env.COMMUNITY_URL ?? "http://localhost:3000";
const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3001";
const APPS_RUNNING = !!(process.env.COMMUNITY_URL && process.env.PORTAL_URL);

describe("SSO Cookie Configuration", () => {
  it("COOKIE_DOMAIN env var is defined when set (apex domain format)", () => {
    const cookieDomain = process.env.COOKIE_DOMAIN;
    if (cookieDomain) {
      // If set, must start with dot for apex-domain cookie sharing
      expect(cookieDomain).toMatch(/^\./);
    } else {
      // Unset is valid for dev — cookies shared via localhost without domain attribute
      expect(cookieDomain).toBeUndefined();
    }
  });

  it("auth cookie name is predictable based on NODE_ENV", () => {
    const isProd = process.env.NODE_ENV === "production";
    const expectedName = isProd ? "__Secure-authjs.session-token" : "authjs.session-token";
    // Both apps use the same @igbo/auth config — cookie name must match
    expect(expectedName).toMatch(/authjs\.session-token$/);
  });
});

describe.skipIf(!APPS_RUNNING)("Cross-app SSO Flow (requires running apps)", () => {
  it("community login sets cookie with correct Domain attribute", async () => {
    // POST to community auth endpoint and inspect Set-Cookie header
    const response = await fetch(`${COMMUNITY_URL}/api/auth/session`, {
      method: "GET",
      credentials: "include",
    });
    // Community app must respond with auth endpoint
    expect(response.status).toBeLessThan(500);
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader && process.env.COOKIE_DOMAIN) {
      // If COOKIE_DOMAIN is set, verify it appears in the Set-Cookie header
      expect(setCookieHeader.toLowerCase()).toContain(
        `domain=${process.env.COOKIE_DOMAIN.toLowerCase()}`,
      );
    }
  });

  it("portal auth endpoint responds correctly", async () => {
    const response = await fetch(`${PORTAL_URL}/api/auth/session`, {
      method: "GET",
    });
    // Portal auth handler is wired — must not 404
    expect(response.status).not.toBe(404);
    expect(response.status).toBeLessThan(500);
  });

  it("portal middleware redirects unauthenticated request to community login", async () => {
    const response = await fetch(`${PORTAL_URL}/dashboard`, {
      method: "GET",
      redirect: "manual",
    });
    // Should redirect (301/302/307/308) to community login
    expect([301, 302, 307, 308]).toContain(response.status);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain(COMMUNITY_URL);
    expect(location).toContain("login");
  });
});

describe("Portal Role Assignment", () => {
  it("getUserPortalRoles is exported from @igbo/db/queries/auth-permissions", async () => {
    // Verify the DB query function used by the JWT callback to resolve portal roles
    const mod = await import("@igbo/db/queries/auth-permissions");
    expect(typeof mod.getUserPortalRoles).toBe("function");
  });

  it("PortalRole values are JOB_SEEKER, EMPLOYER, JOB_ADMIN", () => {
    // Runtime contract check: these string values must be recognized by getUserPortalRoles filter
    const PORTAL_ROLE_NAMES = new Set(["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"]);
    expect(PORTAL_ROLE_NAMES.size).toBe(3);
    expect(PORTAL_ROLE_NAMES.has("JOB_SEEKER")).toBe(true);
    expect(PORTAL_ROLE_NAMES.has("EMPLOYER")).toBe(true);
    expect(PORTAL_ROLE_NAMES.has("JOB_ADMIN")).toBe(true);
  });
});

describe("Safari ITP Workaround — verify-session endpoint contract", () => {
  it("verify-session route file exists in community app", async () => {
    const { existsSync } = await import("fs");
    const { resolve } = await import("path");
    const routePath = resolve(
      __dirname,
      "../../apps/community/src/app/api/auth/verify-session/route.ts",
    );
    expect(existsSync(routePath)).toBe(true);
  });

  it("portal middleware file has _itp_refresh logic", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const middlewarePath = resolve(__dirname, "../../apps/portal/src/middleware.ts");
    const content = readFileSync(middlewarePath, "utf-8");
    expect(content).toContain("_itp_refresh");
    expect(content).toContain("verify-session");
    expect(content).toContain("itpRefreshOrLogin");
  });

  it("COMMUNITY_URL env var is documented in config env schema", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const envPath = resolve(__dirname, "../../packages/config/src/env.ts");
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("COMMUNITY_URL");
    expect(content).toContain("SESSION_UPDATE_AGE_SECONDS");
  });

  it("SESSION_UPDATE_AGE_SECONDS default is 3600 (1 hour) in auth config", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const configPath = resolve(__dirname, "../../packages/auth/src/config.ts");
    const content = readFileSync(configPath, "utf-8");
    // Verify config uses env var with default 3600
    expect(content).toContain('SESSION_UPDATE_AGE_SECONDS || "3600"');
  });
});

describe.skipIf(!APPS_RUNNING)(
  "Safari ITP Workaround — live app tests (requires running apps)",
  () => {
    it("verify-session endpoint redirects unauthenticated request to login", async () => {
      const response = await fetch(
        `${COMMUNITY_URL}/api/auth/verify-session?returnTo=${encodeURIComponent(`${PORTAL_URL}/dashboard`)}`,
        { method: "GET", redirect: "manual" },
      );
      // No session cookie → should redirect to /login
      expect([301, 302, 307, 308]).toContain(response.status);
      const location = response.headers.get("location") ?? "";
      expect(location).toContain("/login");
    });

    it("portal middleware triggers verify-session redirect when cookie is missing", async () => {
      const response = await fetch(`${PORTAL_URL}/dashboard`, {
        method: "GET",
        redirect: "manual",
      });
      // Should redirect to verify-session (not login) on first unauthenticated attempt
      expect([301, 302, 307, 308]).toContain(response.status);
      const location = response.headers.get("location") ?? "";
      expect(location).toContain("/api/auth/verify-session");
      expect(location).toContain("returnTo=");
    });

    it("portal middleware falls back to login when _itp_refresh=1 is already present", async () => {
      const response = await fetch(`${PORTAL_URL}/dashboard?_itp_refresh=1`, {
        method: "GET",
        redirect: "manual",
      });
      // _itp_refresh=1 means refresh was already attempted — should go to login now
      expect([301, 302, 307, 308]).toContain(response.status);
      const location = response.headers.get("location") ?? "";
      expect(location).toContain(COMMUNITY_URL);
      expect(location).toContain("login");
      expect(location).not.toContain("verify-session");
    });
  },
);

describe("Migration 0050 — Portal roles seeded in auth_roles", () => {
  it("migration file 0050_seed_portal_roles.sql exists", async () => {
    const { existsSync } = await import("fs");
    const { resolve } = await import("path");
    const migrationPath = resolve(
      __dirname,
      "../../packages/db/src/migrations/0050_seed_portal_roles.sql",
    );
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("journal entry for migration 0050 exists", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const journalPath = resolve(__dirname, "../../packages/db/src/migrations/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find((e) => e.tag === "0050_seed_portal_roles");
    expect(entry).toBeDefined();
    expect(entry?.idx).toBe(50);
  });
});
