import "server-only";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * Minimal Markdown → HTML renderer for authored content.
 * Handles: headings (h2–h4), bold, italic, unordered lists, paragraphs.
 * All output passes through sanitize-html before use in the DOM.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const htmlLines: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Headings
    if (line.startsWith("#### ")) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<h4>${inlineMarkdown(line.slice(5))}</h4>`);
    } else if (line.startsWith("### ")) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      // Unordered list items
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        htmlLines.push("<ul>");
        inList = true;
      }
      htmlLines.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      // Blank line — close list if open
    } else if (line === "") {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      // Paragraph
    } else {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }

  if (inList) htmlLines.push("</ul>");

  const html = htmlLines.join("\n");
  return sanitizeHtml(html);
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}
