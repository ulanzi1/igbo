// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sanitizeSearchSnippet } from "./sanitize-search-snippet";

describe("sanitizeSearchSnippet", () => {
  it("passes through a normal snippet with <mark> tags", () => {
    expect(sanitizeSearchSnippet("<mark>engineer</mark> role")).toBe("<mark>engineer</mark> role");
  });

  it("escapes <script> tags", () => {
    expect(sanitizeSearchSnippet("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes <img> with onerror", () => {
    expect(sanitizeSearchSnippet("<img src=x onerror=alert(1)>")).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
  });

  it("does NOT un-escape uppercase <MARK> (case-sensitive allow-list)", () => {
    expect(sanitizeSearchSnippet("<MARK>upper</MARK>")).toBe("&lt;MARK&gt;upper&lt;/MARK&gt;");
  });

  it("handles malformed <mark (no closing >) safely", () => {
    expect(sanitizeSearchSnippet("<mark")).toBe("&lt;mark");
  });

  it("handles mixed: marks preserved, script escaped", () => {
    expect(sanitizeSearchSnippet("<mark>a</mark><script>x</script><mark>b</mark>")).toBe(
      "<mark>a</mark>&lt;script&gt;x&lt;/script&gt;<mark>b</mark>",
    );
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeSearchSnippet("")).toBe("");
  });

  it("returns empty string for null input (defensive runtime guard)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeSearchSnippet(null as any)).toBe("");
  });

  it("returns empty string for undefined input (defensive runtime guard)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeSearchSnippet(undefined as any)).toBe("");
  });

  it("handles text with no HTML at all", () => {
    expect(sanitizeSearchSnippet("senior software engineer at Igbo tech")).toBe(
      "senior software engineer at Igbo tech",
    );
  });

  it("handles multiple mark pairs", () => {
    expect(sanitizeSearchSnippet("The <mark>Igbo</mark> community <mark>engineer</mark>")).toBe(
      "The <mark>Igbo</mark> community <mark>engineer</mark>",
    );
  });
});
