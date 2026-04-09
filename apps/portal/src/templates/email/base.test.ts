// @vitest-environment node
import { describe, it, expect } from "vitest";
import { escHtml, renderBase } from "./base";

describe("escHtml", () => {
  it("escapes ampersand", () => {
    expect(escHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes double quotes", () => {
    expect(escHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escHtml("it's")).toBe("it&#39;s");
  });

  it("coerces non-strings to string", () => {
    expect(escHtml(42)).toBe("42");
    expect(escHtml(null)).toBe("null");
  });

  it("handles empty string", () => {
    expect(escHtml("")).toBe("");
  });
});

describe("renderBase", () => {
  it("wraps content in full HTML document", () => {
    const html = renderBase("<p>Hello</p>", "en");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("OBIGBO");
  });

  it("sets lang attribute for Igbo", () => {
    const html = renderBase("<p>Ndewo</p>", "ig");
    expect(html).toContain('<html lang="ig">');
  });

  it("includes footer text in English", () => {
    const html = renderBase("", "en");
    expect(html).toContain("member of OBIGBO");
  });

  it("includes footer text in Igbo", () => {
    const html = renderBase("", "ig");
    expect(html).toContain("onye otu OBIGBO");
  });

  it("uses custom unsubscribe URL when provided", () => {
    const html = renderBase("", "en", "https://example.com/unsub");
    expect(html).toContain("https://example.com/unsub");
  });
});
