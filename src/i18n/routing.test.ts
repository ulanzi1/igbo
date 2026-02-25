// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("next-intl/routing", () => ({
  defineRouting: vi.fn(
    (config: { locales: string[]; defaultLocale: string; localeCookie?: { maxAge?: number } }) =>
      config,
  ),
}));

describe("i18n routing config", () => {
  it("defines locales as en and ig", async () => {
    const { routing } = await import("./routing");
    expect(routing.locales).toContain("en");
    expect(routing.locales).toContain("ig");
  });

  it("sets defaultLocale to en", async () => {
    const { routing } = await import("./routing");
    expect(routing.defaultLocale).toBe("en");
  });

  it("defines exactly two locales", async () => {
    const { routing } = await import("./routing");
    expect(routing.locales).toHaveLength(2);
  });

  it("has localeCookie configured with a maxAge for persistent locale across sessions", async () => {
    const { routing } = await import("./routing");
    expect(routing.localeCookie).toBeDefined();
    expect((routing.localeCookie as { maxAge: number }).maxAge).toBeGreaterThan(0);
  });
});
