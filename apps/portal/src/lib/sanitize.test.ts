// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("strips script tags", () => {
    const result = sanitizeHtml("<script>alert('xss')</script><p>Valid content</p>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>Valid content</p>");
  });

  it("preserves allowed tags: p, h2, h3, strong, a, ul, li, blockquote", () => {
    const input =
      "<p>Para</p><h2>Heading 2</h2><h3>Heading 3</h3><strong>Bold</strong>" +
      '<a href="https://example.com">Link</a><ul><li>Item</li></ul>' +
      "<blockquote>Quote</blockquote>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<p>Para</p>");
    expect(result).toContain("<h2>Heading 2</h2>");
    expect(result).toContain("<h3>Heading 3</h3>");
    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain('<a href="https://example.com">Link</a>');
    expect(result).toContain("<ul><li>Item</li></ul>");
    expect(result).toContain("<blockquote>Quote</blockquote>");
  });

  it("strips disallowed attributes like onclick", () => {
    const result = sanitizeHtml('<p onclick="evil()">Hello</p>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("<p>Hello</p>");
  });

  it("strips javascript: URLs in links", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">Click me</a>');
    expect(result).not.toContain("javascript:");
  });

  it("only allows https scheme in links", () => {
    const httpsResult = sanitizeHtml('<a href="https://safe.com">Safe</a>');
    const httpResult = sanitizeHtml('<a href="http://unsafe.com">Unsafe</a>');
    const ftpResult = sanitizeHtml('<a href="ftp://files.com">FTP</a>');
    expect(httpsResult).toContain('href="https://safe.com"');
    expect(httpResult).not.toContain('href="http://');
    expect(ftpResult).not.toContain('href="ftp://');
  });

  it("strips img tags (not in allowed list for portal job postings)", () => {
    const result = sanitizeHtml('<img src="https://evil.com/tracker.png" /><p>Text</p>');
    expect(result).not.toContain("<img");
    expect(result).toContain("<p>Text</p>");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("preserves em, b, i, ol, br tags", () => {
    const result = sanitizeHtml("<em>Italic</em><b>Bold</b><i>Alt</i><ol><li>One</li></ol><br>");
    expect(result).toContain("<em>Italic</em>");
    expect(result).toContain("<b>Bold</b>");
    expect(result).toContain("<i>Alt</i>");
    expect(result).toContain("<ol><li>One</li></ol>");
    expect(result).toContain("<br />");
  });
});
