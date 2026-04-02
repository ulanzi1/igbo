// @vitest-environment node
import { describe, it, expect } from "vitest";

// Import the config to test headers are properly defined
// We test the config object directly since Next.js applies headers at runtime
async function loadNextConfig() {
  const mod = await import("./next.config");
  return mod.default;
}

describe("next.config.ts security headers", () => {
  it("has headers function defined", async () => {
    const config = await loadNextConfig();
    expect(config.headers).toBeDefined();
    expect(typeof config.headers).toBe("function");
  });

  it("applies security headers to all routes", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    expect(headers.length).toBeGreaterThanOrEqual(1);

    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    expect(catchAll).toBeDefined();
  });

  it("includes Content-Security-Policy header", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const csp = catchAll.headers.find((h: { key: string }) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp.value).toContain("default-src 'self'");
    expect(csp.value).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp.value).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp.value).toContain("img-src 'self' blob: data:");
    expect(csp.value).toContain("font-src 'self'");
    expect(csp.value).toContain("object-src 'none'");
    expect(csp.value).toContain("base-uri 'self'");
    expect(csp.value).toContain("form-action 'self'");
    expect(csp.value).toContain("frame-ancestors 'none'");
    expect(csp.value).toContain("upgrade-insecure-requests");
  });

  it("includes connect-src with realtime server URL for WebSocket support", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const csp = catchAll.headers.find((h: { key: string }) => h.key === "Content-Security-Policy");
    expect(csp.value).toContain("connect-src 'self'");
  });

  it("includes worker-src 'self' for service worker support", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const csp = catchAll.headers.find((h: { key: string }) => h.key === "Content-Security-Policy");
    expect(csp.value).toContain("worker-src 'self'");
  });

  it("includes X-Frame-Options: DENY", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const header = catchAll.headers.find((h: { key: string }) => h.key === "X-Frame-Options");
    expect(header).toBeDefined();
    expect(header.value).toBe("DENY");
  });

  it("includes X-Content-Type-Options: nosniff", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const header = catchAll.headers.find(
      (h: { key: string }) => h.key === "X-Content-Type-Options",
    );
    expect(header).toBeDefined();
    expect(header.value).toBe("nosniff");
  });

  it("includes Strict-Transport-Security header", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const header = catchAll.headers.find(
      (h: { key: string }) => h.key === "Strict-Transport-Security",
    );
    expect(header).toBeDefined();
    expect(header.value).toBe("max-age=63072000; includeSubDomains; preload");
  });

  it("includes Referrer-Policy header", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const header = catchAll.headers.find((h: { key: string }) => h.key === "Referrer-Policy");
    expect(header).toBeDefined();
    expect(header.value).toBe("strict-origin-when-cross-origin");
  });

  it("includes Permissions-Policy header", async () => {
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const header = catchAll.headers.find((h: { key: string }) => h.key === "Permissions-Policy");
    expect(header).toBeDefined();
    expect(header.value).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("disables poweredByHeader", async () => {
    const config = await loadNextConfig();
    expect(config.poweredByHeader).toBe(false);
  });

  it("does not include 'unsafe-eval' in non-development environments", async () => {
    // NODE_ENV in test/production should never include 'unsafe-eval' in CSP
    const config = await loadNextConfig();
    const headers = await config.headers!();
    const catchAll = headers.find((h: { source: string }) => h.source === "/(.*)");
    const csp = catchAll.headers.find((h: { key: string }) => h.key === "Content-Security-Policy");
    // NODE_ENV during vitest is "test", not "development"
    expect(process.env.NODE_ENV).not.toBe("development");
    expect(csp.value).not.toContain("'unsafe-eval'");
  });
});
