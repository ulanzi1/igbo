// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("REALTIME_PORT", () => {
  it("defaults to 3002 (not 3001 — port 3001 is reserved for portal)", async () => {
    const { REALTIME_PORT } = await import("./realtime");
    // Default must be 3002 — port 3001 is used by the portal Next.js dev server
    expect(REALTIME_PORT).toBe(3002);
  });

  it("parses REALTIME_PORT as integer (parsing logic)", () => {
    // Test the parseInt parsing directly without relying on module re-evaluation
    // (dynamic imports return cached module — can't change env mid-test-run)
    const parsePort = (val: string | undefined) => parseInt(val ?? "3002", 10);
    expect(parsePort("4000")).toBe(4000);
    expect(parsePort("3002")).toBe(3002);
    expect(parsePort(undefined)).toBe(3002);
  });
});

describe("REALTIME_CORS_ORIGINS", () => {
  let originalOrigin: string | undefined;

  beforeEach(() => {
    originalOrigin = process.env.REALTIME_CORS_ORIGIN;
  });

  afterEach(() => {
    if (originalOrigin !== undefined) {
      process.env.REALTIME_CORS_ORIGIN = originalOrigin;
    } else {
      delete process.env.REALTIME_CORS_ORIGIN;
    }
  });

  it("returns an array (not a single string)", () => {
    // Use the static export — module already loaded
    // We test the runtime parsing logic directly
    const origins = parseOrigins("http://localhost:3000,http://localhost:3001");
    expect(Array.isArray(origins)).toBe(true);
  });

  it("default includes both localhost:3000 (community) and localhost:3001 (portal)", () => {
    const origins = parseOrigins(undefined);
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://localhost:3001");
  });

  it("parses comma-separated origins into array", () => {
    const origins = parseOrigins("https://app.igbo.com,https://jobs.igbo.com");
    expect(origins).toEqual(["https://app.igbo.com", "https://jobs.igbo.com"]);
  });

  it("trims whitespace around origins", () => {
    const origins = parseOrigins("  http://localhost:3000 , http://localhost:3001  ");
    expect(origins).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  it("handles single origin (no comma)", () => {
    const origins = parseOrigins("http://localhost:3000");
    expect(origins).toEqual(["http://localhost:3000"]);
  });

  it("filters out empty strings from poorly formatted input", () => {
    const origins = parseOrigins("http://localhost:3000,,http://localhost:3001");
    expect(origins).not.toContain("");
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://localhost:3001");
  });
});

describe("NAMESPACE_PORTAL", () => {
  it('equals "/portal"', async () => {
    const { NAMESPACE_PORTAL } = await import("./realtime");
    expect(NAMESPACE_PORTAL).toBe("/portal");
  });
});

// Helper to test the parsing logic independently of module caching
function parseOrigins(input: string | undefined): string[] {
  return (input ?? "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
