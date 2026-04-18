// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import robots from "./robots";

const PORTAL_URL = "https://jobs.igbo.com";

beforeEach(() => {
  process.env.NEXT_PUBLIC_PORTAL_URL = PORTAL_URL;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PORTAL_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("robots()", () => {
  it("returns correct user-agent rule with allow and disallow paths", () => {
    const result = robots();

    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules).toHaveLength(1);
    const rule = rules[0];
    expect(rule?.userAgent).toBe("*");
    expect(rule?.allow).toBe("/");
    expect(rule?.disallow).toContain("/admin/");
    expect(rule?.disallow).toContain("/api/");
    expect(rule?.disallow).toContain("/(gated)/");
  });

  it("disallows /admin/ path", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules[0]?.disallow).toContain("/admin/");
  });

  it("disallows /api/ path", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules[0]?.disallow).toContain("/api/");
  });

  it("disallows /(gated)/ path", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules[0]?.disallow).toContain("/(gated)/");
  });

  it("sets sitemap URL using NEXT_PUBLIC_PORTAL_URL", () => {
    const result = robots();
    expect(result.sitemap).toBe(`${PORTAL_URL}/sitemap.xml`);
  });

  it("falls back to NEXT_PUBLIC_APP_URL when NEXT_PUBLIC_PORTAL_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_PORTAL_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.igbo.com";

    const result = robots();
    expect(result.sitemap).toBe("https://app.igbo.com/sitemap.xml");
  });

  it("uses empty string base when neither env var is set", () => {
    delete process.env.NEXT_PUBLIC_PORTAL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    const result = robots();
    expect(result.sitemap).toBe("/sitemap.xml");
  });
});
