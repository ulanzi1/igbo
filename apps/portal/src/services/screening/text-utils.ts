import "server-only";
import sanitize from "sanitize-html";

/** Strip all HTML tags from input, returning plain text with collapsed whitespace. */
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const stripped = sanitize(html, { allowedTags: [], allowedAttributes: {} });
  return stripped.replace(/\s+/g, " ").trim();
}

/** Lowercase + NFKD accent-normalize a string for case/accent-insensitive matching. */
export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}
