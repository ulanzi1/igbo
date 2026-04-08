// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { stripHtmlToText, normalizeForMatching } from "./text-utils";

describe("stripHtmlToText", () => {
  it("strips HTML tags", () => {
    expect(stripHtmlToText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("collapses whitespace", () => {
    expect(stripHtmlToText("<p>Hello   world</p>")).toBe("Hello world");
  });

  it("returns empty string for null", () => {
    expect(stripHtmlToText(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(stripHtmlToText(undefined)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtmlToText("")).toBe("");
  });

  it("strips nested HTML", () => {
    expect(stripHtmlToText("<div><p>Hello</p><ul><li>item</li></ul></div>")).toContain("Hello");
    expect(stripHtmlToText("<div><p>Hello</p><ul><li>item</li></ul></div>")).toContain("item");
  });

  it("strips script tags", () => {
    const result = stripHtmlToText('<script>alert("xss")</script>Text');
    expect(result).not.toContain("<script>");
    expect(result).toContain("Text");
  });
});

describe("normalizeForMatching", () => {
  it("lowercases text", () => {
    expect(normalizeForMatching("Hello World")).toBe("hello world");
  });

  it("strips diacritics", () => {
    expect(normalizeForMatching("naïve")).toBe("naive");
    expect(normalizeForMatching("café")).toBe("cafe");
    expect(normalizeForMatching("résumé")).toBe("resume");
  });

  it("handles accented Igbo characters", () => {
    const result = normalizeForMatching("Ọ̀nụ");
    expect(result).not.toContain("\u0323"); // combining dot below
  });

  it("returns already normalized text unchanged", () => {
    expect(normalizeForMatching("hello world")).toBe("hello world");
  });
});
