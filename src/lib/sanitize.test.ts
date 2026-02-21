// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("allows safe HTML tags", () => {
    const input =
      "<p>Hello <strong>world</strong> <em>italic</em> <b>bold</b></p>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("allows headings h2, h3, h4", () => {
    expect(sanitizeHtml("<h2>Title</h2>")).toBe("<h2>Title</h2>");
    expect(sanitizeHtml("<h3>Subtitle</h3>")).toBe("<h3>Subtitle</h3>");
    expect(sanitizeHtml("<h4>Section</h4>")).toBe("<h4>Section</h4>");
  });

  it("allows lists", () => {
    const input = "<ul><li>Item 1</li><li>Item 2</li></ul>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("allows ordered lists", () => {
    const input = "<ol><li>First</li><li>Second</li></ol>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("allows blockquote, code, pre, br", () => {
    expect(sanitizeHtml("<blockquote>Quote</blockquote>")).toBe(
      "<blockquote>Quote</blockquote>",
    );
    expect(sanitizeHtml("<code>code</code>")).toBe("<code>code</code>");
    expect(sanitizeHtml("<pre>preformatted</pre>")).toBe(
      "<pre>preformatted</pre>",
    );
    expect(sanitizeHtml("Line 1<br />Line 2")).toBe("Line 1<br />Line 2");
  });

  it("allows safe href attributes with https", () => {
    const input = '<a href="https://example.com">Link</a>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("strips http:// links (only https is allowed per AC)", () => {
    const result = sanitizeHtml('<a href="http://example.com">Link</a>');
    expect(result).not.toContain("http://");
  });

  it("allows rel and class attributes", () => {
    const input =
      '<a href="https://example.com" rel="noopener" class="link">Link</a>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  // XSS vector tests
  it("strips script tags", () => {
    const input = '<script>alert("xss")</script><p>Safe</p>';
    expect(sanitizeHtml(input)).toBe("<p>Safe</p>");
  });

  it("strips event handlers", () => {
    const input = '<p onclick="alert(1)">Click me</p>';
    expect(sanitizeHtml(input)).toBe("<p>Click me</p>");
  });

  it("strips onerror handlers on images", () => {
    const input = '<img src="x" onerror="alert(1)">';
    expect(sanitizeHtml(input)).toBe("");
  });

  it("strips javascript: protocol links", () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("strips data: URIs", () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">X</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("data:");
  });

  it("strips iframes", () => {
    const input = '<iframe src="https://evil.com"></iframe><p>Safe</p>';
    expect(sanitizeHtml(input)).toBe("<p>Safe</p>");
  });

  it("strips style attributes", () => {
    const input =
      '<p style="background:url(javascript:alert(1))">Styled</p>';
    expect(sanitizeHtml(input)).toBe("<p>Styled</p>");
  });

  it("handles nested encoding attacks", () => {
    const input = '<a href="java&#115;cript:alert(1)">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("strips h1, h5, h6 tags (not in allowlist)", () => {
    expect(sanitizeHtml("<h1>Big</h1>")).toBe("Big");
    expect(sanitizeHtml("<h5>Small</h5>")).toBe("Small");
  });

  it("strips div and span tags", () => {
    expect(sanitizeHtml("<div>Content</div>")).toBe("Content");
    expect(sanitizeHtml("<span>Inline</span>")).toBe("Inline");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(sanitizeHtml("Hello world")).toBe("Hello world");
  });
});
