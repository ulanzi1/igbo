# ADR: dangerouslySetInnerHTML Safe-Use Pattern

**Date:** 2026-03-05
**Status:** Accepted
**Context:** Story 6.2 review found an XSS vulnerability — user-generated HTML was rendered via `dangerouslySetInnerHTML` in the admin article preview modal without sanitization. `sanitize-html` was already installed and used in other parts of the codebase but was not applied before this client render.

---

## Decision

Any HTML string rendered via React's `dangerouslySetInnerHTML` MUST be sanitized with `sanitize-html` on the **server** before being passed to a client component.

## Pattern

**Server Component (or API route) — sanitize before sending to client:**

```ts
import sanitizeHtml from "sanitize-html";

const safeEnHtml = sanitizeHtml(rawEnHtml, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h2", "h3", "img"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt"],
  },
});
// Pass safeEnHtml as a prop to the client component
```

**Client Component — render pre-sanitized HTML:**

```tsx
// Safe: the HTML was sanitized server-side before reaching this component
<div dangerouslySetInnerHTML={{ __html: enContent }} />
```

## Rationale

- `sanitize-html` is already installed in this project (`package.json`).
- Server-side sanitization runs once before the HTML is sent over the wire, keeping the client bundle free of sanitization logic.
- The article reading flow (Story 6.3) is the canonical correct example: `ArticlePage` (Server Component) calls `sanitizeHtml` before passing `enContent`/`igContent` to `<ArticleLanguageToggle>` (Client Component).
- Static HTML strings authored by developers do not need sanitization — only user-generated content (article body, profile bio, rich text from Tiptap, etc.).

## Pre-Review Checklist

- [ ] Every `dangerouslySetInnerHTML` usage can be traced to a `sanitize-html` call upstream in a Server Component or API route.
- [ ] The HTML source is user-generated content (not developer-authored static strings).
- [ ] `sanitize-html` options include the tags/attributes used by Tiptap output (h2, h3, img, a, ul, ol, li, blockquote, strong, em, code, pre).
