/**
 * Strips all HTML tags from a string and returns plain text.
 * Also decodes common HTML entities and normalizes whitespace.
 *
 * Implementation note: regex-based (no external dep) — input is already
 * sanitized HTML from sanitizeHtml(), so no security concern. We want
 * plain text for JSON-LD and og:description, not safe HTML rendering.
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "") // Remove script blocks + content
    .replace(/<style[\s\S]*?<\/style>/gi, "") // Remove style blocks + content
    .replace(/<br\s*\/?>/gi, " ") // Replace <br> / <br/> with space
    .replace(
      /<\/(?:p|div|li|h[1-6]|tr|td|th|blockquote|section|article|header|footer|ul|ol|dl|dd|dt|pre)>/gi,
      " ",
    ) // Space after block-level closing tags
    .replace(/<[^>]*>/g, "") // Remove all remaining HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Truncates text at a word boundary and appends "..." if the text exceeds maxLength.
 * Returns the original text unchanged if it is already within maxLength.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.8 ? truncated.slice(0, lastSpace) : truncated) + "...";
}
