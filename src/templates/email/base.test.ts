// @vitest-environment node
import { describe, it, expect } from "vitest";
import { escHtml, renderBase } from "./base";

describe("escHtml", () => {
  it("escapes &", () => {
    expect(escHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes <", () => {
    expect(escHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes >", () => {
    expect(escHtml("a > b")).toBe("a &gt; b");
  });

  it('escapes "', () => {
    expect(escHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("escapes '", () => {
    expect(escHtml("it's")).toBe("it&#39;s");
  });

  it("escapes all special chars in one string", () => {
    expect(escHtml("a & <b> \"c\" 'd'")).toBe("a &amp; &lt;b&gt; &quot;c&quot; &#39;d&#39;");
  });

  it("converts non-string to string first", () => {
    expect(escHtml(42)).toBe("42");
    expect(escHtml(null)).toBe("null");
  });
});

describe("renderBase", () => {
  it("returns a string containing <html> and <body>", () => {
    const result = renderBase("<p>Hello</p>", "en");
    expect(result).toContain("<html");
    expect(result).toContain("<body");
  });

  it("contains the injected content", () => {
    const result = renderBase("<p>Test content</p>", "en");
    expect(result).toContain("<p>Test content</p>");
  });

  it("contains OBIGBO branding", () => {
    const result = renderBase("", "en");
    expect(result).toContain("OBIGBO");
  });

  it("contains brand color #D4631F", () => {
    const result = renderBase("", "en");
    expect(result).toContain("#D4631F");
  });

  it("English footer differs from Igbo footer", () => {
    const en = renderBase("", "en");
    const ig = renderBase("", "ig");
    expect(en).not.toBe(ig);
    expect(en).toContain("You're receiving this email");
    expect(ig).toContain("Ị na-enweta email a");
  });

  it("sets html lang attribute correctly", () => {
    const en = renderBase("", "en");
    const ig = renderBase("", "ig");
    expect(en).toContain('lang="en"');
    expect(ig).toContain('lang="ig"');
  });
});
