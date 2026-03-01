# Decision Record: Rich Text Editor Library

**Date:** 2026-03-01
**Status:** Decided
**Deciders:** Winston (Architect), Amelia (Dev)
**Relevant story:** Story 4.2 — Post Creation & Rich Media

---

## Context

Story 4.2 requires a rich text editor for post creation with the following requirements:

- Bold, italic, links (basic inline formatting)
- Media embeds (photo/video via presigned URL upload)
- `@mentions` with autocomplete (same `@[Name](mention:userId)` format used in chat)
- Category tags (Discussion, Announcement, Event)
- Mobile-friendly (full-screen modal on mobile, inline on desktop)
- Next.js App Router + TypeScript strict + React 18
- SSR-safe (no `window` access during server render)

---

## Options Evaluated

### Option A — Tiptap

- **What it is:** ProseMirror-based headless editor with React extensions. Active, well-funded OSS.
- **TypeScript:** First-class — all extensions are fully typed.
- **SSR:** Safe — core library has no browser globals; extensions can be conditionally loaded.
- **@mentions:** Built-in Mention extension with autocomplete support. Same trigger format as our existing chat `@mention` UX.
- **Media embeds:** Image extension + custom node extension for video.
- **Bundle size:** Core ~35 kB gzipped; extensions are tree-shaken.
- **Maturity:** Used in Linear, Vercel, Descript. Well-documented.
- **License:** MIT (OSS tier) / commercial tiers for advanced features. Our requirements fit MIT.
- **Risk:** Low. Extensions are composable; adding features doesn't require rewriting the editor.

### Option B — Lexical

- **What it is:** Meta's production editor (used in Facebook, WhatsApp Web). React-first.
- **TypeScript:** Good but verbose — requires more boilerplate per plugin.
- **SSR:** Generally safe but still maturing on Next.js App Router.
- **@mentions:** Requires building a custom plugin from scratch. No official mention plugin at time of writing.
- **Media embeds:** Custom node required — no official image/video extension.
- **Bundle size:** Similar to Tiptap (~30 kB), but plugin ecosystem is thinner.
- **Maturity:** Production-proven at Meta scale, but ecosystem and documentation are behind Tiptap.
- **Risk:** Medium. More implementation work needed for required features.

### Option C — Quill

- **What it is:** Older DOM-based editor. Long community maintenance history.
- **TypeScript:** Community types — not maintained by Quill authors.
- **SSR:** Problematic — `document` access during import requires dynamic imports + careful guarding.
- **@mentions:** `quill-mention` plugin; less maintained.
- **Media embeds:** `quill-image-uploader`; less integrated than Tiptap.
- **Maturity:** V2 in beta since 2022; development pace has slowed.
- **Risk:** High. SSR complexity, weak TypeScript, stagnating ecosystem.

---

## Decision

**Tiptap** (MIT OSS tier).

### Rationale

1. **@mention parity:** Tiptap's `@tiptap/extension-mention` produces the same trigger pattern (`@Name`) as our existing chat mention UX. We can reuse the `MemberSearch` API already built in Story 2.3 for the autocomplete backend.

2. **TypeScript-first:** Critical for this project's `strict` TypeScript config. Lexical requires significantly more boilerplate; Quill types are third-party.

3. **SSR safety:** Tiptap works correctly in Next.js App Router without `dynamic(() => import(...), { ssr: false })` gymnastics. The editor is client-only (post composer is a `"use client"` component), but the library itself won't crash on server-side module evaluation.

4. **Composable extensions:** Bold, italic, links, images, and custom video nodes are each an independent extension. Adding or removing features requires no architectural change.

5. **Ecosystem health:** Actively maintained, extensive documentation, large community. Lexical is technically sound but the ecosystem for our specific needs (mentions, media) is thinner.

---

## Implementation Notes for Story 4.2

- Install: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/extension-image`, `@tiptap/extension-link`
- The post composer is a `"use client"` component — no SSR constraint at component level.
- Re-use `searchMembers` server action (Story 2.3) for the `@mention` suggestion list.
- Custom `VideoNode` Tiptap extension for video embeds (TipTap Image extension for photos).
- Output format: JSON (Tiptap's native `getJSON()`) stored in `community_posts.content`; rendered via a read-only Tiptap instance or a custom serializer (matching how `RichTextRenderer` works for chat).
- The `content_type` field in `community_posts` distinguishes `text` (plain) from `rich_text` (Tiptap JSON).

---

## Outcome

No mid-story library pivots. Story 4.2 will implement the post composer using Tiptap from day one.
