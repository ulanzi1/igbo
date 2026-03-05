# Bilingual Dual-Pane Tiptap Editor — Design & Prototype

**Date:** 2026-03-05
**Status:** Accepted
**Stakeholders:** Winston (Architect), Alice (PO), Sally (UX Designer)
**Context:** Story 6.1 — Article Editor & Submission requires a bilingual editing experience for community articles (English + Igbo). This document defines the agreed design. Story 6.1 AC references this doc.

---

## Agreed Design

### Layout: Side-by-Side Dual Pane

On desktop (md+), the editor shows two Tiptap panes side-by-side. On mobile, a tab toggle switches between panes.

```
┌─────────────────────────────────────────────────────────────────┐
│  Article Editor                                    [Save Draft] │
├───────────────────────────┬─────────────────────────────────────┤
│  🇬🇧 English (Required)   │  🇳🇬 Igbo  (Optional)              │
│  ─────────────────────    │  ─────────────────────              │
│  Title: _____________     │  Title: _____________               │
│                           │  (leave blank to skip)              │
│  ┌───────────────────┐    │  ┌───────────────────┐             │
│  │  Tiptap Editor    │    │  │  Tiptap Editor    │             │
│  │  (StarterKit,     │    │  │  (StarterKit,     │             │
│  │   Image, Link,    │    │  │   Image, Link,    │             │
│  │   Mention)        │    │  │   Mention)        │             │
│  └───────────────────┘    │  └───────────────────┘             │
│  [B] [I] [Link] [Img]     │  [B] [I] [Link] [Img]              │
├───────────────────────────┴─────────────────────────────────────┤
│  Category: [Discussion ▾]   Tags: [ + add tag ]                 │
│  Cover image: [ Upload ]                                         │
│                                     [Submit for Review →]        │
└─────────────────────────────────────────────────────────────────┘
```

**Mobile (< md) — tab toggle:**

```
┌─────────────────────────────────┐
│  [🇬🇧 English] [🇳🇬 Igbo]        │  ← tab bar
├─────────────────────────────────┤
│  Title: ___________________     │
│  ┌─────────────────────────┐   │
│  │  Tiptap Editor          │   │
│  └─────────────────────────┘   │
│  [B] [I] [Link] [Img]          │
└─────────────────────────────────┘
```

---

## Language Selection Behavior

| Pane    | Required? | Behavior                                                                                                                           |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| English | ✅ Yes    | Always visible. Submit blocked if English content is empty.                                                                        |
| Igbo    | Optional  | Side-by-side pane (desktop) or tab (mobile). Empty Igbo = article published English-only. Non-empty Igbo must have Igbo title too. |

### Validation rules

1. **English title + body**: both required. Submit button disabled until filled.
2. **Igbo title**: required if Igbo body is non-empty; optional otherwise.
3. **Igbo body**: optional. If blank, article is published with `igboContent: null`.
4. **Cover image**: optional (but strongly recommended — show hint when missing).

---

## Component Architecture

```
ArticleEditor
├── BilingualEditorPane (×2 — EN + IG)
│   ├── TitleInput (plain <input>)
│   └── TiptapEditor (Tiptap EditorContent + toolbar)
│       Extensions: StarterKit, Image, Link, Mention
├── ArticleMetaForm (category, tags, cover image upload)
└── SubmitButton (disabled until English content valid)
```

### State shape

```ts
interface ArticleEditorState {
  enTitle: string;
  enContent: string; // Tiptap JSON stringified
  igTitle: string;
  igContent: string | null; // null = Igbo pane left empty
  category: "discussion" | "event" | "announcement";
  coverImageUploadId: string | null;
}
```

### Submission logic

```ts
// Derived before submit:
const hasIgboContent = igContent && igContent !== '{"type":"doc","content":[]}';
const igboPayload = hasIgboContent ? { igTitle, igContent } : null; // published English-only

// Server action receives:
await submitArticleAction({ enTitle, enContent, igboPayload, category, coverImageUploadId });
```

---

## Tiptap Configuration Per Pane

Both panes share the same extension config. Image + Mention extensions are available in both.

```ts
const extensions = [
  StarterKit,
  Image.configure({ inline: false }),
  Link.configure({ openOnClick: false }),
  Mention.configure({
    suggestion: buildMentionSuggestion(members), // same member list for both panes
  }),
];
```

No custom extensions needed for the bilingual requirement. The panes are structurally independent Tiptap instances.

---

## Key Decisions

1. **Two independent Tiptap instances** (not a single shared editor): content is independent between panes. Authors write EN first, then Igbo. No auto-translation.
2. **JSON storage format** for both panes: `editor.getJSON()` → stored as JSONB. Rendered server-side via `generateHTML()` from `@tiptap/html`.
3. **Igbo "optional" vs "required"** controlled by a single boolean flag per article type (story 6.1 will default optional for all types).
4. **Mobile tab toggle** uses a simple `useState<"en" | "ig">` — no router state. Both Tiptap instances are always mounted (avoiding re-mount on tab switch which would lose content).
5. **FileUpload component** reused from Story 1.14 for cover image. No new upload infrastructure needed.

---

## Story 6.1 Acceptance Criteria References

Story 6.1 AC should specify:

- Dual-pane layout per this doc (desktop side-by-side, mobile tab toggle)
- English pane required; Igbo pane optional
- English title + body required before submit; Igbo title required only if Igbo body non-empty
- Submit creates article with `status: 'draft'` and `igboContent: null` if Igbo blank
- Cover image optional but prompted
- FileUpload component reused from `src/components/shared/FileUpload.tsx`
- Both Tiptap instances always mounted (no remount on mobile tab switch)
