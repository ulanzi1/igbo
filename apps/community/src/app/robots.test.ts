// @vitest-environment node
import { describe, it, expect } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("allows public locale paths", () => {
    const result = robots();
    const rules = result.rules;
    const firstRule = Array.isArray(rules) ? rules[0] : rules;

    expect(firstRule).toBeDefined();
    const allow = firstRule?.allow;
    expect(allow).toContain("/en/");
    expect(allow).toContain("/ig/");
  });

  it("blocks authenticated route patterns", () => {
    const result = robots();
    const rules = result.rules;
    const firstRule = Array.isArray(rules) ? rules[0] : rules;

    expect(firstRule).toBeDefined();
    const disallow = firstRule?.disallow as string[];
    expect(disallow).toBeDefined();

    // Should block dashboard, chat, profile, settings, admin, notifications
    const blockedPatterns = ["dashboard", "chat", "profile", "settings", "admin", "notifications"];
    for (const pattern of blockedPatterns) {
      expect(disallow.some((d) => d.includes(pattern))).toBe(true);
    }
  });

  it("includes sitemap URL", () => {
    const result = robots();
    expect(result.sitemap).toBeDefined();
    expect(result.sitemap).toContain("/sitemap.xml");
  });

  it("applies rules to all user agents", () => {
    const result = robots();
    const rules = result.rules;
    const firstRule = Array.isArray(rules) ? rules[0] : rules;
    expect(firstRule?.userAgent).toBe("*");
  });
});
