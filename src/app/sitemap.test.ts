// @vitest-environment node
import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("returns entries for all public routes", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);

    // Should have entries for both locales
    expect(urls.some((u) => u.includes("/en"))).toBe(true);
    expect(urls.some((u) => u.includes("/ig"))).toBe(true);
  });

  it("includes both locale entries for each route", () => {
    const entries = sitemap();
    const publicRoutes = [
      "",
      "/about",
      "/articles",
      "/events",
      "/blog",
      "/apply",
      "/terms",
      "/privacy",
    ];

    for (const route of publicRoutes) {
      const enEntries = entries.filter((e) => e.url.endsWith(`/en${route}`));
      const igEntries = entries.filter((e) => e.url.endsWith(`/ig${route}`));
      expect(enEntries.length).toBeGreaterThanOrEqual(1);
      expect(igEntries.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("includes hreflang alternates for each entry", () => {
    const entries = sitemap();

    for (const entry of entries) {
      expect(entry.alternates).toBeDefined();
      expect(entry.alternates?.languages).toBeDefined();
      const languages = entry.alternates?.languages as Record<string, string>;
      expect(languages["en"]).toBeDefined();
      expect(languages["ig"]).toBeDefined();
    }
  });

  it("splash page entries have highest priority", () => {
    const entries = sitemap();
    const splashEntries = entries.filter((e) => e.url.endsWith("/en") || e.url.endsWith("/ig"));
    for (const entry of splashEntries) {
      expect(entry.priority).toBe(1.0);
    }
  });

  it("total entries equal public routes x locales", () => {
    const entries = sitemap();
    // 8 routes x 2 locales = 16
    expect(entries).toHaveLength(16);
  });
});
