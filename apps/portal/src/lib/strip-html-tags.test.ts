import { describe, it, expect } from "vitest";
import { stripHtmlTags, truncateText } from "./strip-html-tags";

describe("stripHtmlTags", () => {
  it("removes basic tags", () => {
    expect(stripHtmlTags("<p>Hello world</p>")).toBe("Hello world");
  });

  it("removes nested tags", () => {
    expect(stripHtmlTags("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("replaces <br/> with space between text", () => {
    expect(stripHtmlTags("Line 1<br/>Line 2")).toBe("Line 1 Line 2");
  });

  it("replaces <br> (no slash) with space between text", () => {
    expect(stripHtmlTags("Hello<br>world")).toBe("Hello world");
  });

  it("decodes &amp;", () => {
    expect(stripHtmlTags("Rock &amp; Roll")).toBe("Rock & Roll");
  });

  it("decodes &lt; and &gt;", () => {
    expect(stripHtmlTags("A &lt; B &gt; C")).toBe("A < B > C");
  });

  it("decodes &quot;", () => {
    expect(stripHtmlTags("Say &quot;hello&quot;")).toBe('Say "hello"');
  });

  it("decodes &#39;", () => {
    expect(stripHtmlTags("It&#39;s fine")).toBe("It's fine");
  });

  it("decodes &nbsp;", () => {
    expect(stripHtmlTags("hello&nbsp;world")).toBe("hello world");
  });

  it("handles double-encoded &amp;amp; — single-pass decoding produces &amp;", () => {
    // Single-pass: &amp;amp; → &amp;amp;.replace(/&amp;/g, '&') → &amp;
    // (The first &amp; is decoded to &, leaving &amp; from the original amp; suffix)
    // This is expected behavior for single-pass entity decoding.
    expect(stripHtmlTags("&amp;amp;")).toBe("&amp;");
  });

  it("normalizes multiple whitespace", () => {
    expect(stripHtmlTags("<p>Hello  \n  world</p>")).toBe("Hello world");
  });

  it("handles empty string", () => {
    expect(stripHtmlTags("")).toBe("");
  });

  it("passes through plain text unchanged", () => {
    expect(stripHtmlTags("Hello world, no tags here")).toBe("Hello world, no tags here");
  });

  it("removes script tag content", () => {
    expect(stripHtmlTags("<script>alert('xss')</script>safe text")).toBe("safe text");
  });

  it("removes style tag content", () => {
    expect(stripHtmlTags("<style>body{color:red}</style>visible text")).toBe("visible text");
  });

  it("handles multiline script tags", () => {
    expect(stripHtmlTags('<script type="text/javascript">\nvar x = 1;\n</script>content')).toBe(
      "content",
    );
  });

  it("handles complex HTML with spaces between block-level elements", () => {
    const html =
      "<h1>Job Title</h1><p>We are looking for a <strong>talented</strong> engineer.</p><ul><li>Skill A</li><li>Skill B</li></ul>";
    expect(stripHtmlTags(html)).toBe(
      "Job Title We are looking for a talented engineer. Skill A Skill B",
    );
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripHtmlTags("  <p>  hello  </p>  ")).toBe("hello");
  });
});

describe("truncateText", () => {
  it("returns text unchanged when shorter than maxLength", () => {
    expect(truncateText("Hello world", 50)).toBe("Hello world");
  });

  it("returns text unchanged when exactly at maxLength", () => {
    expect(truncateText("Hello", 5)).toBe("Hello");
  });

  it("truncates at word boundary when space is close enough", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const result = truncateText(text, 20);
    // maxLength=20, truncated='The quick brown fox ', lastSpace at index 19
    // 19 > 20*0.8=16 → truncate at word boundary
    expect(result).toMatch(/\.\.\.$/);
    expect(result.length).toBeLessThan(text.length);
    expect(result).not.toContain("<");
  });

  it("truncates at hard boundary when no space in 80% window", () => {
    const text = "Averylongwordwithoutspaces_andmorecontent";
    const result = truncateText(text, 15);
    // No space near 80% of 15=12 chars
    expect(result).toBe("Averylongwordwi...");
  });

  it("appends '...' to truncated text", () => {
    const text = "Hello beautiful world";
    const result = truncateText(text, 10);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles text with length 0", () => {
    expect(truncateText("", 10)).toBe("");
  });

  it("truncates long descriptions to word boundary near maxLength", () => {
    const description =
      "We are seeking a talented Senior Software Engineer to join our team in Lagos Nigeria";
    const result = truncateText(description, 50);
    expect(result.endsWith("...")).toBe(true);
    // Should not exceed maxLength + 3 for '...'
    expect(result.length).toBeLessThanOrEqual(53);
  });
});
