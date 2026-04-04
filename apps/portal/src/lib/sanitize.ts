import "server-only";
import sanitize from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "h2",
  "h3",
  "strong",
  "em",
  "b",
  "i",
  "a",
  "ul",
  "ol",
  "li",
  "br",
  "blockquote",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "rel"],
};

const ALLOWED_SCHEMES = ["https"];

export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    disallowedTagsMode: "discard",
  });
}
