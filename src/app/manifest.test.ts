// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("PWA manifest", () => {
  it("exports a default function", async () => {
    const { default: manifest } = await import("./manifest");
    expect(typeof manifest).toBe("function");
  });

  it("returns correct app name", async () => {
    const { default: manifest } = await import("./manifest");
    const result = manifest();
    expect(result.name).toBe("Igbo Community Platform");
    expect(result.short_name).toBe("Igbo");
  });

  it("returns standalone display mode", async () => {
    const { default: manifest } = await import("./manifest");
    const result = manifest();
    expect(result.display).toBe("standalone");
  });

  it("returns correct brand theme color", async () => {
    const { default: manifest } = await import("./manifest");
    const result = manifest();
    expect(result.theme_color).toBe("#2D5A27");
    expect(result.background_color).toBe("#FAF8F5");
  });

  it("returns correct start URL", async () => {
    const { default: manifest } = await import("./manifest");
    const result = manifest();
    expect(result.start_url).toBe("/en");
  });

  it("includes both required icon sizes", async () => {
    const { default: manifest } = await import("./manifest");
    const result = manifest();
    expect(result.icons).toBeDefined();
    expect(result.icons!.length).toBeGreaterThanOrEqual(2);
    const sizes = result.icons!.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
});
