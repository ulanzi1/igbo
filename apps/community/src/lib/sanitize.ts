import "server-only";
import sanitize from "sanitize-html";

const ALLOWED_TAGS = [
  "b",
  "i",
  "em",
  "strong",
  "a",
  "p",
  "ul",
  "ol",
  "li",
  "br",
  "blockquote",
  "h2",
  "h3",
  "h4",
  "code",
  "pre",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "rel", "class"],
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
