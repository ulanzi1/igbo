# ADR: Incremental Static Regeneration (ISR) in Next.js App Router with Auth.js

**Date:** 2026-03-05
**Status:** Accepted
**Context:** Story 6.3 — Article Reading Experience requires public-facing article pages that are fast to load and SEO-friendly while staying in sync with publication state.

---

## Decision

Use `export const revalidate = 60` (Segment Route Config) in the article reading page route segment. This enables ISR at the route level: the page is statically generated on first request and revalidated in the background at most every 60 seconds.

---

## Verified Behavior (Next.js 15 App Router + Auth.js v5)

### How it works

```ts
// src/app/[locale]/articles/[slug]/page.tsx
export const revalidate = 60; // ISR: revalidate at most every 60 seconds

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await getPublishedArticle(params.slug); // cached for 60s
  if (!article) notFound();
  return <ArticleView article={article} />;
}
```

- On the **first request**: Next.js fetches data, renders the page, and caches it.
- On **subsequent requests within 60s**: the cached static HTML is served instantly.
- After 60s: the next request triggers a background rerender. The stale page is served during the rerender (stale-while-revalidate semantics).

### Auth.js session interaction

ISR only applies to the **static shell**. Personalised data (is bookmarked, viewer's reaction) must be fetched **client-side** after hydration — not server-side — because ISR pages cannot be personalised per-user.

**Rule:** ISR article pages render the public content statically. Auth-gated actions (bookmark, react, comment) are loaded client-side via hooks after the page mounts.

```tsx
// ✅ CORRECT — public content from ISR, personal state client-side
export const revalidate = 60;

export default async function ArticlePage() {
  const article = await getPublishedArticle(slug); // static, same for all users
  return <ArticleView article={article} />;
  // BookmarkButton, ReactionBar fetched client-side via useQuery hooks
}

// ❌ WRONG — calling getServerSession() in an ISR page
export const revalidate = 60;

export default async function ArticlePage() {
  const session = await getServerSession(); // forces dynamic rendering, defeats ISR
  ...
}
```

### Dynamic vs static opt-in

If `getServerSession()` (or `auth()` from Auth.js v5) is called in a Server Component inside an ISR route, Next.js **automatically switches to dynamic rendering** for that request, bypassing the static cache. This is the most common gotcha.

**Known gotchas:**

1. Calling `auth()` / `getServerSession()` in any Server Component on the page = dynamic rendering. Use client-side session hooks (`useSession()`) for auth-gated features on ISR pages.
2. `cookies()` and `headers()` calls also opt into dynamic rendering.
3. ISR does not apply to API routes — those are always dynamic.
4. `generateStaticParams()` enables pre-rendering known slugs at build time. Combine with `revalidate = 60` to pre-build popular articles and revalidate on publish.
5. `notFound()` in an ISR page caches the 404 for the revalidation window — consider a shorter `revalidate` for articles that may be published soon after a 404.

---

## Minimal Working Example

```ts
// src/app/[locale]/articles/[slug]/page.tsx
import { notFound } from "next/navigation";
import { getPublishedArticle } from "@/db/queries/articles";

export const revalidate = 60;

export async function generateStaticParams() {
  // Pre-render the 20 most recently published articles at build time
  const slugs = await getRecentArticleSlugs(20);
  return slugs.map((slug) => ({ slug }));
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) notFound();
  return <ArticleView article={article} />;
}
```

---

## On-Demand Revalidation (for Story 6.2 publish flow)

When a moderator publishes an article, trigger on-demand revalidation so the ISR cache is invalidated immediately rather than waiting up to 60s:

```ts
// In the publish server action / API route:
import { revalidatePath } from "next/cache";

revalidatePath(`/en/articles/${article.slug}`);
revalidatePath(`/ig/articles/${article.slug}`);
```

This is safe to call from a Server Action or Route Handler.

---

## Story 6.3 References This Doc

Story 6.3 spec should specify:

- `revalidate = 60` on the article page route segment
- `generateStaticParams()` for top N articles
- `revalidatePath()` call in the Story 6.2 publish action
- Client-side hooks for bookmark/reaction/comment (not server-side auth)
- hreflang + JSON-LD structured data added as static metadata (no auth dependency)
