// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// sanitizeHtml is a passthrough for test purposes
vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: (html: string) => html,
}));

import { renderMarkdown } from "./render-markdown";

describe("renderMarkdown", () => {
  it("converts h2 headings", () => {
    expect(renderMarkdown("## Hello")).toBe("<h2>Hello</h2>");
  });

  it("converts h3 headings", () => {
    expect(renderMarkdown("### Subheading")).toBe("<h3>Subheading</h3>");
  });

  it("converts h4 headings", () => {
    expect(renderMarkdown("#### Minor")).toBe("<h4>Minor</h4>");
  });

  it("converts plain text to paragraphs", () => {
    expect(renderMarkdown("Hello world")).toBe("<p>Hello world</p>");
  });

  it("converts bold text", () => {
    expect(renderMarkdown("This is **bold** text")).toBe(
      "<p>This is <strong>bold</strong> text</p>",
    );
  });

  it("converts italic with asterisks", () => {
    expect(renderMarkdown("This is *italic* text")).toBe("<p>This is <em>italic</em> text</p>");
  });

  it("converts italic with underscores", () => {
    expect(renderMarkdown("This is _italic_ text")).toBe("<p>This is <em>italic</em> text</p>");
  });

  it("converts unordered list items with -", () => {
    const md = "- Item 1\n- Item 2\n- Item 3";
    const expected = "<ul>\n<li>Item 1</li>\n<li>Item 2</li>\n<li>Item 3</li>\n</ul>";
    expect(renderMarkdown(md)).toBe(expected);
  });

  it("converts unordered list items with *", () => {
    const md = "* First\n* Second";
    const expected = "<ul>\n<li>First</li>\n<li>Second</li>\n</ul>";
    expect(renderMarkdown(md)).toBe(expected);
  });

  it("closes list when blank line follows", () => {
    const md = "- Item 1\n\nParagraph";
    const expected = "<ul>\n<li>Item 1</li>\n</ul>\n<p>Paragraph</p>";
    expect(renderMarkdown(md)).toBe(expected);
  });

  it("closes list when heading follows", () => {
    const md = "- Item 1\n## Heading";
    const expected = "<ul>\n<li>Item 1</li>\n</ul>\n<h2>Heading</h2>";
    expect(renderMarkdown(md)).toBe(expected);
  });

  it("handles mixed content", () => {
    const md = "## Title\n\nA paragraph with **bold**.\n\n- Item 1\n- Item 2\n\nAnother paragraph.";
    const result = renderMarkdown(md);
    expect(result).toContain("<h2>Title</h2>");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<p>Another paragraph.</p>");
  });

  it("handles empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("applies inline markdown inside headings", () => {
    expect(renderMarkdown("## **Bold** heading")).toBe("<h2><strong>Bold</strong> heading</h2>");
  });

  it("applies inline markdown inside list items", () => {
    expect(renderMarkdown("- **bold** item")).toBe(
      "<ul>\n<li><strong>bold</strong> item</li>\n</ul>",
    );
  });
});
