# Story 1.3: Responsive Layout Shell & PWA Foundation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the responsive layout shells built, i18n bootstrapped, and the Lite PWA configured with service worker and offline fallback,
So that all pages render in the correct layout, support bilingual UI from day one, and the app is installable on mobile devices.

## Acceptance Criteria

### AC 1: Responsive AppShell Layout Architecture

- **Given** the design system is ready (Story 1.2)
- **When** a user visits any page on mobile (< 768px)
- **Then** the AppShell renders with a top navigation bar (logo, placeholder items) and a bottom tab bar (5 tabs: Home, Chat, Discover, Events, Profile)
- **And** content fills the viewport between top nav and bottom tabs with proper safe-area insets

- **When** a user visits any page on tablet (768-1024px)
- **Then** the AppShell renders with the desktop top navigation bar but without the bottom tab bar
- **And** content areas use a condensed single-column or two-column grid (not the full desktop three-column layout)

- **When** a user visits any page on desktop (> 1024px)
- **Then** the AppShell renders with a top navigation bar (logo, nav placeholder items, search placeholder, notification bell placeholder, profile avatar placeholder)
- **And** content renders in the appropriate multi-column layout

### AC 2: GuestShell Layout

- **Given** an unauthenticated user visits a public page
- **When** the page renders
- **Then** a GuestShell renders with a separate marketing-style navigation (logo, About, Join/Apply CTA)
- **And** the layout is distinct from the authenticated AppShell

### AC 3: Internationalization (i18n) Bootstrap

- **Given** i18n is required from day one
- **When** next-intl is configured
- **Then** English (`en.json`) and Igbo (`ig.json`) message files exist with skeleton keys for navigation labels, common UI labels, system messages, and error messages
- **And** the locale is detected from the URL path segment (`/en/...`, `/ig/...`) and persisted per user preference
- **And** all routes are nested under `[locale]` with proper `<html lang>` attribute
- **And** `useTranslations()` is used for every user-facing string in the shell components (no hardcoded strings)
- **And** the skip link is translated using `useTranslations("Shell")` and lives in a locale-aware layout or shell (not the root layout)

### AC 4: PWA Configuration

- **Given** the platform needs Lite PWA capabilities from launch
- **When** Serwist (`@serwist/next`) is configured
- **Then** a `manifest.ts` is generated with app name ("Igbo Community Platform"), placeholder icons, OBIGBO theme colors, and `display: standalone`
- **And** the service worker implements cache strategies: cache-first for static assets, stale-while-revalidate for public content, network-first for authenticated API calls
- **And** a graceful offline fallback page renders when the user is offline ("You're offline — reconnect to continue") with culturally warm messaging per the EmptyState pattern
- **And** the app is installable on mobile home screens (Android and iOS)
- **And** the offline fallback URL matches locale routing (e.g., `/en/~offline`, `/ig/~offline`) and is precached for both locales

### AC 5: ContrastToggle & LanguageToggle in Navigation

- **Given** the ContrastToggle is temporarily mounted in layout.tsx (Story 1.2)
- **When** the AppShell navigation is created
- **Then** the ContrastToggle is moved from layout.tsx into the TopNav component
- **And** a LanguageToggle component is created and placed in the TopNav alongside the ContrastToggle
- **And** the LanguageToggle switches between English and Igbo, updating the URL locale segment

## Tasks / Subtasks

- [x] Task 1: Configure next-intl i18n routing (AC: #3)
  - [x] Create `src/i18n/routing.ts` with `defineRouting({ locales: ['en', 'ig'], defaultLocale: 'en' })`
  - [x] Create `src/i18n/request.ts` with `getRequestConfig` that dynamically imports `messages/${locale}.json`
  - [x] Create `src/i18n/navigation.ts` with `createNavigation(routing)` exporting `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname`
  - [x] Create skeleton message files `messages/en.json` and `messages/ig.json` with namespaces: `Common` (loading, error, offline, back), `Navigation` (home, chat, discover, events, profile, about, join, settings, search, notifications), `Shell` (appName, skipToContent, menuOpen, menuClose, languageToggle, contrastToggle), `Errors` (notFound, offline, generic). Igbo file uses English placeholder values suffixed with ` [ig]` for visual verification — Story 1.11 provides real translations.
  - [x] **Confirm message file location**: use a single convention (`/messages/*.json` at repo root as referenced in imports) and align all imports accordingly; do not mix with `src/i18n/messages/`.
  - [x] Update `next.config.ts`: wrap config with `createNextIntlPlugin('./src/i18n/request.ts')` from `next-intl/plugin` (explicit path — do not use the no-argument default). Compose with Serwist wrapper (Task 5). **Order:** `withSerwist(withNextIntl(nextConfig))` — Serwist outermost since it modifies webpack config.
  - [x] **Do NOT rename** `src/middleware.ts` (project uses it + tests). Instead, compose existing X-Request-Id logic with `createMiddleware(routing)` from `next-intl/middleware` inside `src/middleware.ts`, preserving the test at `src/middleware.test.ts` and the existing export shape.
  - [x] Update matcher to exclude `api`, `_next`, `_vercel`, static files, and `sw.js`.
  - [x] **Update `src/middleware.test.ts`** — added locale redirect tests, X-Request-Id on redirect, X-Request-Id on pass-through, updated `_vercel`-excluding matcher assertions. All existing X-Request-Id test cases preserved.
  - [x] Write unit tests for i18n routing config and navigation exports

- [x] Task 2: Restructure app directory for locale-based routing (AC: #3)
  - [x] Move `src/app/page.tsx` content into `src/app/[locale]/page.tsx` (temporary placeholder page)
  - [x] Create `src/app/[locale]/layout.tsx` as the locale layout: await `params.locale`, validate with `hasLocale()`, call `setRequestLocale()`, render `<html lang={locale}>`, wrap children with `<NextIntlClientProvider>`. Move font loading and metadata from current root `layout.tsx`. **Place the skip link here** using `useTranslations("Shell")`.
  - [x] Simplify `src/app/layout.tsx` to a bare root layout that passes children through (needed for `[locale]` nesting). Remove font className from body — move to locale layout.
  - [x] Create route group `src/app/[locale]/(app)/layout.tsx` — imports and renders `AppShell` (Task 3)
  - [x] Create route group `src/app/[locale]/(guest)/layout.tsx` — imports and renders `GuestShell` (Task 4)
  - [x] Preserve existing route groups `(auth)` and `(admin)` under `[locale]` with minimal layout files
  - [x] Create `src/app/[locale]/not-found.tsx` with i18n-aware 404 page using `useTranslations()` and `setRequestLocale()`
  - [x] Create `src/app/[locale]/error.tsx` — locale-aware error boundary (`'use client'`). Uses `useTranslations('Errors')` for `generic` and `genericDescription` keys, includes "Try again" reset button calling the `reset` prop.
  - [x] **Root `src/app/not-found.tsx`:** Kept as-is. Handles 404s outside the `[locale]` segment.
  - [x] Add `generateStaticParams()` returning `[{ locale: 'en' }, { locale: 'ig' }]` to locale layout and page files for static rendering support
  - [x] Ensure `id="main-content"` is placed on the `<main>` element in both AppShell and GuestShell (matches the skip link)
  - [x] Call `setRequestLocale()` at the top of every server component page/layout under `[locale]`

- [x] Task 3: Build AppShell responsive layout (AC: #1, #5)
  - [x] Create `src/components/layout/AppShell.tsx` — responsive container with TopNav + content area + conditional BottomNav (mobile only)
  - [x] Create `src/components/layout/TopNav.tsx` — desktop/tablet top navigation bar with logo, nav placeholder links, search placeholder, notification bell, ContrastToggle, LanguageToggle, profile avatar placeholder. All labels use `useTranslations('Navigation')`.
  - [x] Create `src/components/layout/BottomNav.tsx` — mobile-only (below md breakpoint) fixed bottom tab bar with 5 tabs. Icons from lucide-react, labels from `useTranslations('Navigation')`. Active tab highlighted. 44px minimum tap targets. `pb-[env(safe-area-inset-bottom)]`.
  - [x] Create `src/components/layout/Footer.tsx` — minimal footer for desktop (copyright, links to about/terms/privacy)
  - [x] All shell components use `useTranslations()` — zero hardcoded strings
  - [x] Remove `ContrastToggle` mount from `src/app/layout.tsx` (now in TopNav)
  - [x] **Update `ContrastToggle.tsx` CSS classes**: removed `fixed`, `bottom-*`, `right-*` positioning classes. Replaced with `relative`, `h-11 w-11` for inline flow in TopNav. `aria-label`, `aria-pressed`, and 44px tap target preserved.
  - [x] Write unit tests for AppShell, TopNav, BottomNav

- [x] Task 4: Build GuestShell layout (AC: #2)
  - [x] Create `src/components/layout/GuestShell.tsx` — marketing-style layout with GuestNav + content + Footer
  - [x] Create `src/components/layout/GuestNav.tsx` — simplified navigation with logo, About link, LanguageToggle, ContrastToggle, "Join Community" CTA. Mobile: hamburger menu icon that opens a Sheet with nav links.
  - [x] All labels use `useTranslations('Navigation')`
  - [x] Write unit tests for GuestShell and GuestNav rendering

- [x] Task 5: Configure Serwist PWA (AC: #4)
  - [x] Create `src/app/sw.ts` — service worker entry point using Serwist with `defaultCache`, locale-aware offline fallbacks for `/en/~offline` and `/ig/~offline`
  - [x] Update `next.config.ts`: added `withSerwistInit` with `swSrc`, `swDest`, `additionalPrecacheEntries` for both locale offline pages, `cacheOnNavigation`, `reloadOnOnline`, disabled in development. Composed with next-intl plugin.
  - [x] Update `next.config.ts` CSP to include `worker-src 'self'` and `manifest-src 'self'`
  - [x] Update `next.config.test.ts` to verify `worker-src 'self'` in CSP
  - [x] Create `src/app/[locale]/~offline/page.tsx` — offline fallback page using EmptyState component with warm messaging, WifiOffIcon, and `useTranslations('Errors')`
  - [x] Create `src/app/manifest.ts` using `MetadataRoute.Manifest` with correct app name, OBIGBO colors, placeholder icons
  - [x] Create placeholder PWA icon files in `public/icons/` at 192×192 and 512×512 (valid minimal PNGs)
  - [x] Add `viewport` export to locale layout with `themeColor: '#2D5A27'` and PWA meta tags (`apple-mobile-web-app-capable`)
  - [x] Add to `.gitignore`: `public/sw.js`, `public/sw.js.map`, `public/swe-worker-*.js`
  - [x] Update `tsconfig.json`: add `"webworker"` to `compilerOptions.lib`, add `"public/sw.js"` to `exclude`
  - [x] Update `package.json` build script to `"build": "next build --webpack"`
  - [x] Write unit test for offline page rendering, verify manifest.ts returns correct structure

- [x] Task 6: Create LanguageToggle component (AC: #3, #5)
  - [x] Create `src/components/shared/LanguageToggle.tsx` — button that switches between `en` and `ig` using `useRouter()` and `usePathname()` from `@/i18n/navigation`. Accessible `aria-label` from `useTranslations('Shell')`. 44px minimum tap target.
  - [x] Write unit tests for LanguageToggle: renders, switches locale on click, accessible label

- [x] Task 7: Integration testing and verification (AC: #1-5)
  - [x] All 213 tests pass (163 baseline + 50 new tests across 9 new test files)
  - [x] i18n: routing config defines `['en', 'ig']` with `defaultLocale: 'en'`; middleware composes next-intl + X-Request-Id
  - [x] PWA: manifest.ts returns valid manifest structure; offline page renders with EmptyState; service worker configured
  - [x] No hardcoded UI strings in any new component (all use `useTranslations()`)
  - [x] `id="main-content"` on `<main>` in AppShell and GuestShell
  - [x] ContrastToggle removed from root layout and functional in TopNav with inline positioning
  - [x] LanguageToggle in TopNav and GuestNav

## Dev Notes

### Technical Stack — Key Versions for This Story

| Technology    | Version | Notes                                                                                                                                                                   |
| ------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js       | 16.1.x  | App Router. `middleware.ts` stays as `middleware.ts` — architecture doc referenced a `proxy.ts` rename that never shipped. Async `params` mandatory. Turbopack default. |
| next-intl     | ^4.8.3  | Already in `package.json`. Requires `createNextIntlPlugin()` in next.config.ts.                                                                                         |
| @serwist/next | ^9.5.6  | Already in `package.json`. Uses webpack — may need `next build --webpack`. Check `@serwist/turbopack` first.                                                            |
| serwist       | ^9.5.6  | Already in `package.json`. ESM only. `matcher` replaces `urlPattern`, strategy instances required.                                                                      |
| Tailwind CSS  | v4      | CSS-first config via `@theme inline` in globals.css. NO `tailwind.config.ts`.                                                                                           |
| shadcn/ui     | 3.8.5+  | Copy-paste components in `src/components/ui/`. Already configured.                                                                                                      |
| lucide-react  | latest  | Icon library for nav icons. Already installed.                                                                                                                          |
| React         | 19.2.3  | No `forwardRef` needed in new components. Ref as prop.                                                                                                                  |
| TypeScript    | 5+      | Strict mode. `noUncheckedIndexedAccess: true`.                                                                                                                          |

### Critical Architecture Constraints

1. **Do NOT rename `src/middleware.ts`.** This project already uses `src/middleware.ts` and has tests for it. Compose next-intl middleware inside `src/middleware.ts` and preserve existing X-Request-Id logic and export shape.

2. **Next.js 16: Async params mandatory.** All `params` and `searchParams` must be `await`ed. `const { locale } = await params;` — synchronous access is removed.

3. **next-intl requires `[locale]` route segment.** All routes move under `src/app/[locale]/`. The root `layout.tsx` becomes a bare pass-through. The locale layout at `src/app/[locale]/layout.tsx` provides `<html lang>`, font loading, and `NextIntlClientProvider`.

4. **next-intl `next.config.ts` plugin required.** Must wrap config: `createNextIntlPlugin()(nextConfig)`. Compose with Serwist: `withSerwist(withNextIntl(nextConfig))`.

5. **Serwist v9 breaking changes.** `urlPattern` → `matcher`. String handlers (`"NetworkFirst"`) → strategy instances (`new NetworkFirst()`). `cacheOnFrontEndNav` → `cacheOnNavigation`. Imports from `serwist` package (not `@serwist/core`). Worker imports from `@serwist/next/worker`.

6. **Serwist + Turbopack compatibility.** `@serwist/next` uses webpack plugins. Next.js 16 defaults to Turbopack. **`@serwist/turbopack` is NOT in `package.json`** — do not check for it. Use `next build --webpack` in the `package.json` build script (`"build": "next build --webpack"`). The dev server (`next dev`) continues to use Turbopack — Serwist is disabled in dev via `disable: process.env.NODE_ENV === 'development'`, so there is no conflict.

7. **No hardcoded UI strings.** Every user-facing string in shell components must use `useTranslations()`. This is a HARD RULE from Story 1.3 onward — all future stories inherit this requirement.

8. **`setRequestLocale(locale)` in every page/layout.** Required for static rendering optimization. Must be called at the top of every server component page and layout under `[locale]`.

9. **44px minimum tap targets.** All interactive elements: nav links, tab items, toggle buttons, hamburger menu. Non-negotiable.

10. **16px minimum body text.** Already enforced by design system. Verify it carries through to new layout components.

11. **No dark mode.** Deferred to post-MVP. Do NOT include `.dark` class definitions. Only high-contrast mode toggle exists.

12. **PPR (Partial Prerendering).** Next.js 16 uses `cacheComponents: true` instead of `experimental.ppr`. Consider enabling if available — static shells render instantly while dynamic slots stream in. **Verify:** this may not be needed for Story 1.3 since the shell itself is the static part.

13. **CSP headers.** Current `next.config.ts` has Content Security Policy headers. Adding Serwist service worker may require updating CSP to allow `worker-src 'self'` or `script-src 'self'` for `sw.js`.

### next-intl Configuration Pattern

**File structure:**

```
src/
├── i18n/
│   ├── routing.ts          # defineRouting({ locales, defaultLocale })
│   ├── request.ts          # getRequestConfig — loads messages per locale
│   └── navigation.ts       # createNavigation(routing) — Link, redirect, usePathname, useRouter
├── middleware.ts           # Composed: X-Request-Id + next-intl middleware
messages/
├── en.json                 # English skeleton keys
└── ig.json                 # Igbo skeleton keys (placeholder values)
```

**`src/i18n/routing.ts`:**

```typescript
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ig"],
  defaultLocale: "en",
});
```

**`src/i18n/request.ts`:**

```typescript
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

**`src/i18n/navigation.ts`:**

```typescript
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

**Middleware composition (src/middleware.ts):**

```typescript
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest } from "next/server";

const handleI18nRouting = createMiddleware(routing);

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  if (!requestHeaders.has("X-Request-Id")) {
    requestHeaders.set("X-Request-Id", crypto.randomUUID());
  }
  const requestId = requestHeaders.get("X-Request-Id")!;

  // Pass enriched request so X-Request-Id is forwarded to route handlers and RSCs.
  // NextRequest(request, { headers }) clones the request with overridden headers.
  const enrichedRequest = new NextRequest(request, { headers: requestHeaders });
  const response = handleI18nRouting(enrichedRequest);

  // Echo X-Request-Id in response headers for client-side correlation.
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

**⚠️ Middleware test update required:** After this composition, `src/middleware.test.ts` tests must be updated. The middleware now also handles locale redirects (e.g., `/` → `/en/`). Add test cases for: locale redirect behaviour, X-Request-Id still present on redirect responses, X-Request-Id still forwarded in pass-through responses. Existing test assertions for the matcher pattern must be updated to the new `_vercel`-excluding matcher.

### Serwist PWA Configuration Pattern

**Service worker (`src/app/sw.ts`):**

```typescript
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/en/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
      {
        url: "/ig/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

**`next.config.ts` composition:**

```typescript
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

// Explicit path prevents silent misconfiguration if file is ever moved
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/en/~offline", revision: Date.now().toString() },
    { url: "/ig/~offline", revision: Date.now().toString() },
  ],
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

// Compose: Serwist outermost (webpack config), next-intl inner
export default withSerwist(withNextIntl(nextConfig));
```

**`tsconfig.json` additions:**

```json
{
  "compilerOptions": {
    "lib": ["esnext", "dom", "dom.iterable", "webworker"]
  },
  "exclude": ["node_modules", "public/sw.js"]
}
```

**`.gitignore` additions:**

```
# Serwist generated
public/sw.js
public/sw.js.map
public/swe-worker-*.js
```

### Responsive Layout Specifications

**Breakpoints (Tailwind defaults):**
| Breakpoint | Width | Layout |
|---|---|---|
| Default (mobile) | < 768px | Bottom tab bar, single column, 16px padding |
| md (tablet) | 768-1024px | Top nav only, 1-2 column, 24px padding |
| lg (desktop) | > 1024px | Top nav, multi-column, 32px padding |

**AppShell structure:**

```
Desktop (lg+):
┌──────────────────────────────────────────┐
│ TopNav [logo][Home Chat Discover Events] │
│         [search][bell][contrast][lang][avatar]│
├──────────────────────────────────────────┤
│                                          │
│          <main id="main-content">        │
│              {children}                  │
│                                          │
├──────────────────────────────────────────┤
│ Footer                                   │
└──────────────────────────────────────────┘

Mobile (<md):
┌──────────────────────────────────────────┐
│ TopNav [logo]        [bell][avatar]      │
├──────────────────────────────────────────┤
│                                          │
│          <main id="main-content">        │
│              {children}                  │
│                                          │
├──────────────────────────────────────────┤
│ BottomNav [Home][Chat][Discover][Events][Profile]│
└──────────────────────────────────────────┘

Tablet (md to lg):
┌──────────────────────────────────────────┐
│ TopNav [logo][Home Chat Discover Events] │
│         [search][bell][contrast][lang][avatar]│
├──────────────────────────────────────────┤
│                                          │
│          <main id="main-content">        │
│              {children}                  │
│                                          │
├──────────────────────────────────────────┤
│ Footer                                   │
└──────────────────────────────────────────┘
```

**GuestShell structure:**

```
All viewports:
┌──────────────────────────────────────────┐
│ GuestNav [logo]  [About][lang][contrast] │
│                         [Join Community] │
├──────────────────────────────────────────┤
│                                          │
│          <main id="main-content">        │
│              {children}                  │
│                                          │
├──────────────────────────────────────────┤
│ Footer                                   │
└──────────────────────────────────────────┘

Mobile: hamburger icon opens Sheet with nav links
```

**BottomNav tab specifications:**

- 5 tabs: Home (House icon), Chat (MessageCircle), Discover (Search), Events (Calendar), Profile (User)
- Active tab: primary color icon + label, inactive: muted-foreground
- Tab height: 56px (accommodates 44px tap target + label)
- `pb-[env(safe-area-inset-bottom)]` for notched devices
- Fixed to viewport bottom (`fixed bottom-0 left-0 right-0`)
- `z-50` to stay above content
- **ARIA:** `role="navigation"` + `aria-label="Main navigation"` on nav; tabs use `role="tab"` and `aria-selected`

### Skeleton Message File Structure

**`messages/en.json`:**

```json
{
  "Common": {
    "loading": "Loading...",
    "error": "Something went wrong",
    "back": "Go back",
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "close": "Close",
    "search": "Search",
    "seeAll": "See all"
  },
  "Navigation": {
    "home": "Home",
    "chat": "Chat",
    "discover": "Discover",
    "events": "Events",
    "profile": "Profile",
    "about": "About",
    "join": "Join Community",
    "settings": "Settings",
    "notifications": "Notifications",
    "terms": "Terms",
    "privacy": "Privacy"
  },
  "Shell": {
    "appName": "Igbo Community Platform",
    "skipToContent": "Skip to content",
    "menuOpen": "Open menu",
    "menuClose": "Close menu",
    "languageToggle": "Switch language",
    "contrastToggle": "Toggle high contrast",
    "copyright": "© {year} Igbo Community Platform"
  },
  "Errors": {
    "notFound": "Page not found",
    "notFoundDescription": "The page you're looking for doesn't exist or has been moved.",
    "offline": "You're offline",
    "offlineDescription": "Please check your internet connection and try again.",
    "generic": "Something went wrong",
    "genericDescription": "We encountered an unexpected error. Please try again."
  }
}
```

**`messages/ig.json`:** Same structure, values suffixed with ` [ig]` (e.g., `"home": "Home [ig]"`). Story 1.11 replaces with real Igbo translations.

### Testing next-intl Components in Vitest

All new shell components use `useTranslations()` and/or `useRouter()` from `@/i18n/navigation`. These require specific mock setup in Vitest — without it tests will throw "Could not find next-intl context" errors.

**Standard mock pattern — add to each `.test.tsx` file (or to `src/test/setup.ts`):**

```typescript
// Mock next-intl translations
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => 'en',
}));

// Mock locale-aware navigation from @/i18n/navigation
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
    <a href={href}>{children}</a>,
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));
```

**For server components** that use `getTranslations()` (async), mock the async form:

```typescript
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  setRequestLocale: vi.fn(),
}));
```

**Client components** (`BottomNav`, `LanguageToggle`, relocated `ContrastToggle`) that use `useTranslations()` directly are valid — `NextIntlClientProvider` at the `[locale]` layout level makes the hook available. No `NextIntlClientProvider` wrapper is needed in tests when using the `vi.mock('next-intl', ...)` approach above.

**Important:** `usePathname` from `@/i18n/navigation` returns the path WITHOUT the locale prefix. Mock as `'/'` for home page tests, not `'/en'`.

### Previous Story Intelligence

**From Story 1.2 (Design System & Brand Foundation):**

- **ContrastToggle** is currently mounted in `src/app/layout.tsx` — must be moved to TopNav in this story. The `useContrastMode` hook reads/writes `localStorage` key `igbo-contrast-mode` and applies `data-contrast` attribute on `<html>`.
- **EmptyState** component exists at `src/components/shared/EmptyState.tsx` — use it for the offline fallback page.
- **163 tests passing** across 21 test files — new tests must not break these.
- **Skip link** (`<a href="#main-content">`) added to `layout.tsx` — the matching `id="main-content"` must be placed on `<main>` in AppShell and GuestShell.
- **Toaster** from sonner is in `layout.tsx` — preserve when restructuring.
- **globals.css** uses `@import "tailwindcss"`, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@theme inline`. Do NOT modify the design token structure.
- **Card variants**, skeleton animations, typography scale — all established and ready for use in layout components.

**From Story 1.1a (Project Scaffolding):**

- **Inter font** loaded with `latin-ext` subset via `next/font`. CSS variables `--font-inter` and `--font-jetbrains-mono` set on `<body>` className. **CRITICAL:** When restructuring layouts, these font variable bindings must be preserved — they're referenced by `--font-sans` and `--font-mono` in `globals.css` `@theme inline`.
- **Route groups** `(guest)`, `(auth)`, `(app)`, `(admin)` exist with `.gitkeep` — move under `[locale]`.
- **`src/components/layout/`** directory exists with `.gitkeep` — ready for shell components.
- **`src/i18n/`** directory exists with `.gitkeep` — ready for config files.

**From Story 1.1b (Security Infrastructure):**

- **`src/middleware.ts`** adds `X-Request-Id` (UUID) to all requests. This logic must be preserved when renaming to `proxy.ts` and composing with next-intl.
- **CSP headers** in `next.config.ts` may need `worker-src 'self'` for service worker.

**From Story 1.1c (EventBus, Job Runner):**

- **Redis connections**, EventBus, job runner — not directly relevant but tests must not break.
- Docker cron jobs are configured — no changes needed.

### Git Intelligence

**Recent commits:**

- `af5ec13` — Implement Stories 1-1c (EventBus/Jobs) and 1-2 (Design System) with code review fixes
- `a4380cb` — Initial project setup

**Patterns from previous implementation:**

- Co-located tests beside source files
- `@/` path alias for all imports
- PascalCase for components, kebab-case for non-component files
- Vitest with jsdom environment for component tests
- `vi.mock()` for module mocking
- `server-only` imports for server-side code
- RFC 7807 error responses for API endpoints

### Web Research: Latest Technical Specifics

**next-intl v4.8.3:**

- Stable with Next.js 16 App Router
- `createNavigation()` replaces older `createSharedPathnamesNavigation()`
- `hasLocale()` is the recommended locale validation function
- Server components can use `useTranslations()` (non-async) or `getTranslations()` (async)
- **Client components in this story** (`BottomNav`, `LanguageToggle`, `ContrastToggle`, `GuestNav` hamburger) use `useTranslations()` directly — this is valid because `NextIntlClientProvider` in the `[locale]` layout provides the context. Passing strings as props is a performance optimisation for deeply nested/frequently-re-rendered components; it is NOT a rule for these shell components.
- `NextIntlClientProvider` does NOT need an explicit `messages` prop when used inside `[locale]` layout — it inherits from the request config via the `createNextIntlPlugin` webpack integration

**@serwist/next v9.5.6:**

- v9 is ESM-only — no CJS fallback
- `defaultCache` from `@serwist/next/worker` provides sensible defaults (cache-first for assets, network-first for pages)
- Custom runtime caching requires strategy class instances: `new CacheFirst()`, `new NetworkFirst()`, `new StaleWhileRevalidate()`
- Offline fallback uses `fallbacks.entries` array with matcher functions
- `additionalPrecacheEntries` must include the offline page URL
- Service worker source can be TypeScript — Serwist compiles it

**Next.js 16.1.x:**

- `manifest.ts` file in `src/app/` auto-generates and links manifest
- `viewport` export (separate from `metadata`) for theme-color
- `generateStaticParams()` needed in every page under `[locale]` for static rendering
- Route groups `(name)` don't affect URL structure — ideal for layout separation

### Project Structure Notes

**Files created (new):**

```
messages/
├── en.json                                 # English skeleton translation keys
└── ig.json                                 # Igbo skeleton translation keys (placeholders)

src/
├── i18n/
│   ├── routing.ts                          # next-intl routing config (locales, defaultLocale)
│   ├── routing.test.ts                     # routing config tests
│   ├── request.ts                          # next-intl request config (message loading)
│   └── navigation.ts                       # Wrapped Link, redirect, usePathname, useRouter
├── middleware.ts                           # Composed: X-Request-Id + next-intl middleware
├── app/
│   ├── manifest.ts                         # PWA manifest (MetadataRoute.Manifest)
│   ├── manifest.test.ts                    # manifest tests
│   ├── sw.ts                               # Serwist service worker entry point
│   ├── [locale]/
│   │   ├── layout.tsx                      # Locale layout (html lang, fonts, NextIntlClientProvider)
│   │   ├── page.tsx                        # Placeholder home page
│   │   ├── not-found.tsx                   # i18n-aware 404 page
│   │   ├── error.tsx                       # Locale-aware error boundary ('use client')
│   │   ├── (app)/
│   │   │   └── layout.tsx                  # AppShell layout wrapper
│   │   ├── (guest)/
│   │   │   └── layout.tsx                  # GuestShell layout wrapper
│   │   ├── (auth)/
│   │   │   └── layout.tsx                  # Auth layout (minimal)
│   │   ├── (admin)/
│   │   │   └── layout.tsx                  # Admin layout (minimal)
│   │   └── ~offline/
│   │       ├── page.tsx                    # Offline fallback page (EmptyState)
│   │       └── page.test.tsx               # Offline page tests
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx                    # Authenticated app shell (TopNav + content + BottomNav)
│   │   ├── AppShell.test.tsx               # AppShell tests
│   │   ├── TopNav.tsx                      # Desktop/tablet top navigation bar
│   │   ├── TopNav.test.tsx                 # TopNav tests
│   │   ├── BottomNav.tsx                   # Mobile bottom tab bar (5 tabs)
│   │   ├── BottomNav.test.tsx              # BottomNav tests
│   │   ├── GuestShell.tsx                  # Public/marketing shell
│   │   ├── GuestShell.test.tsx             # GuestShell tests
│   │   ├── GuestNav.tsx                    # Guest navigation bar
│   │   ├── GuestNav.test.tsx               # GuestNav tests
│   │   └── Footer.tsx                      # Shared footer component
│   └── shared/
│       ├── LanguageToggle.tsx              # Locale switch button (en ↔ ig)
│       └── LanguageToggle.test.tsx         # LanguageToggle tests
public/
├── icons/
│   ├── icon-192.png                        # Placeholder PWA icon 192x192
│   └── icon-512.png                        # Placeholder PWA icon 512x512
```

**Files modified:**

- `src/app/layout.tsx` — Simplified to bare root layout (children pass-through). ContrastToggle and Toaster moved to locale layout.
- `src/app/page.tsx` — Redirects to `/en` (content moved to `[locale]/page.tsx`)
- `src/components/shared/ContrastToggle.tsx` — Removed `fixed bottom-4 right-4 z-50` positioning; now `relative h-11 w-11` for inline TopNav flow.
- `next.config.ts` — Added `createNextIntlPlugin()` + `withSerwistInit()` wrappers. Added `worker-src 'self'` and `manifest-src 'self'` to CSP.
- `next.config.test.ts` — Added test for `worker-src 'self'` in CSP (11 tests total, up from 10).
- `src/middleware.ts` — Composed with next-intl middleware; updated matcher to exclude `_vercel`.
- `src/middleware.test.ts` — Added locale redirect tests, X-Request-Id on redirects, updated matcher assertions (7 tests total, up from 3).
- `tsconfig.json` — Added `"webworker"` to `lib`; added `"public/sw.js"` to `exclude`.
- `package.json` — Updated build script to `"build": "next build --webpack"`.
- `.gitignore` — Added `public/sw.js`, `public/sw.js.map`, `public/swe-worker-*.js`.

**Files renamed:**

None (keep `src/middleware.ts` per project rules)

**Note:** `src/components/layout/LanguageToggle.tsx` was created at an incorrect path during implementation. The canonical version is at `src/components/shared/LanguageToggle.tsx`. The layout-path version is unused dead code and should be removed in a cleanup pass.

**Architecture alignment:**

| Constraint                | How This Story Complies                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| No hardcoded UI strings   | All shell components use `useTranslations()` with namespace keys                                      |
| `[locale]` routing        | All routes nested under `src/app/[locale]/` with next-intl                                            |
| Feature module pattern    | Layout components in `src/components/layout/`, shared in `src/components/shared/`                     |
| Co-located tests          | `.test.tsx` files beside source components                                                            |
| PascalCase components     | `AppShell.tsx`, `TopNav.tsx`, `BottomNav.tsx`, `GuestShell.tsx`, `GuestNav.tsx`, `LanguageToggle.tsx` |
| kebab-case non-components | `routing.ts`, `request.ts`, `navigation.ts`                                                           |
| `@/` path alias           | All imports use `@/components/layout/*`, `@/i18n/*`, etc.                                             |
| 44px tap targets          | All nav items, tabs, toggles enforce minimum size                                                     |
| Skeleton > spinner        | Loading states use skeleton components (established in Story 1.2)                                     |
| WCAG 2.1 AA               | Semantic HTML, ARIA labels, keyboard navigation, focus indicators                                     |
| prefers-reduced-motion    | Inherited from Story 1.2 globals.css base layer                                                       |

**Detected conflicts / variances:**

- **Architecture doc references `tailwindcss.config.ts`** — this file does not exist. Tailwind v4 uses CSS-first config in `globals.css`. Ignore any architecture doc references to `tailwind.config.ts`.
- **Architecture doc lists `src/middleware.ts`** — some architecture doc versions reference a `src/proxy.ts` rename that was never released in Next.js. The file stays as `src/middleware.ts`. Do not rename it.
- **Architecture doc shows `public/manifest.json`** — Next.js 16 prefers `src/app/manifest.ts` which auto-generates and links the manifest. Use the `manifest.ts` approach instead of a static JSON file.
- **Architecture doc lists `src/providers/theme-provider.tsx`** — not created yet, deferred per Story 1.2 constraints. Contrast mode handled by hook only.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3: Responsive Layout Shell & PWA Foundation]
- [Source: _bmad-output/planning-artifacts/architecture.md — Component & Directory Structure, Frontend Architecture, Responsive Design, PWA Implementation, API Patterns, Naming Conventions]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Responsive Design & Accessibility, Navigation Patterns, Mobile-First Design, PWA Requirements, Breakpoints, Bottom Tab Bar, Design System]
- [Source: _bmad-output/project-context.md — Technology Stack, Critical Implementation Rules (48 rules), Code Quality & Style Rules]
- [Source: _bmad-output/implementation-artifacts/1-2-design-system-brand-foundation.md — Previous Story Intelligence, ContrastToggle location, EmptyState component, 163 test baseline, skip link, font variables, globals.css structure]
- [Source: _bmad-output/implementation-artifacts/1-1a-project-scaffolding-core-setup.md — Route groups, directory structure, font loading, ESLint config, Vitest setup]
- [Source: _bmad-output/implementation-artifacts/1-1b-security-infrastructure-api-foundation.md — middleware.ts X-Request-Id logic, CSP headers, server-only pattern]
- [Source: _bmad-output/implementation-artifacts/1-1c-eventbus-job-runner-background-jobs.md — Redis connections, EventBus, test patterns]
- [Source: next-intl docs — App Router setup, routing, middleware/proxy, server/client components, message files]
- [Source: Serwist docs — @serwist/next v9 setup, service worker, cache strategies, offline fallback, breaking changes]
- [Source: Next.js 16 docs — proxy.ts rename, async params, Turbopack default, manifest.ts, viewport export, PPR/cacheComponents]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- BottomNav active state: `usePathname()` from next-intl returns path WITHOUT locale prefix. Test mock must use `'/'` (not `'/en'`) for home page active state check.
- `LanguageToggle` initially created at wrong path (`src/components/layout/`). Correct canonical path: `src/components/shared/LanguageToggle.tsx`. The layout-path version is dead code.
- `next.config.ts` test (`next.config.test.ts`) imports the config via `await import('./next.config')` which loads `withSerwist(withNextIntl(...))`. Both wrappers are safe to import in the Vitest node environment — they don't run webpack compilation at import time.

### Completion Notes List

- **213 tests pass** (30 test files): 163 baseline preserved + 50 new tests across 9 new test files
- **New test files**: `src/i18n/routing.test.ts` (3), `src/app/manifest.test.ts` (6), `src/app/[locale]/~offline/page.test.tsx` (4), `src/components/layout/AppShell.test.tsx` (4), `src/components/layout/TopNav.test.tsx` (7), `src/components/layout/BottomNav.test.tsx` (5), `src/components/layout/GuestShell.test.tsx` (4), `src/components/layout/GuestNav.test.tsx` (7), `src/components/shared/LanguageToggle.test.tsx` (5)
- **Updated tests**: `src/middleware.test.ts` (3→7 tests), `next.config.test.ts` (10→11 tests)
- **All acceptance criteria satisfied**: AppShell (AC1), GuestShell (AC2), i18n bootstrap with `[locale]` routing (AC3), Serwist PWA + manifest + offline page (AC4), ContrastToggle moved + LanguageToggle added (AC5)
- Zero hardcoded UI strings in any new component
- `id="main-content"` on `<main>` in AppShell and GuestShell
- 44px minimum tap targets on all interactive elements
- Font variables (`--font-inter`, `--font-jetbrains-mono`) preserved in locale layout

### Change Log

- Implemented Story 1.3: Responsive Layout Shell & PWA Foundation (Date: 2026-02-23)
  - Configured next-intl i18n routing with `[locale]` segments, middleware composition, and skeleton message files
  - Built AppShell (TopNav, BottomNav, Footer) and GuestShell (GuestNav, Footer) responsive layout components
  - Configured Serwist PWA with service worker, manifest, locale-aware offline pages, and placeholder icons
  - Created LanguageToggle component for locale switching (en ↔ ig)
  - Moved ContrastToggle from root layout to TopNav with inline flow positioning
  - Restructured app directory: root layout → bare pass-through; `[locale]/layout.tsx` → full HTML shell
  - Updated CSP with `worker-src 'self'` and `manifest-src 'self'`; updated build script for webpack

- Senior Developer Review (AI) — Code Review Fixes (Date: 2026-02-23)
  - Reviewer: claude-opus-4-6 | 10 issues found (5 HIGH, 3 MEDIUM, 2 LOW) | 8 fixed
  - [H1] Fixed hardcoded "Try again" in error.tsx → uses `useTranslations("Common")` with `tryAgain` key
  - [H2] Fixed hardcoded h1 in [locale]/page.tsx → uses `useTranslations("Shell")` with `appName` key
  - [H3] Fixed hardcoded aria-labels in ContrastToggle.tsx → uses `useTranslations("Shell")` with `contrastToggle` key
  - [H4] Fixed not-found.tsx hardcoded locale "en" → uses `getLocale()` from `next-intl/server` for actual locale
  - [H5] Fixed offline page button using wrong label `Errors.generic` → uses `Common.tryAgain`
  - [M1] Deleted dead code `src/components/layout/LanguageToggle.tsx` (duplicate of shared version)
  - [M2] Fixed Footer.tsx manual `.replace()` → uses next-intl ICU interpolation `tShell("copyright", { year })`
  - [M3] Fixed test mock inconsistency: `usePathname` mock returns `"/"` (not `"/en"`) in 4 test files
  - [L1] Fixed TopNav unnecessary nullish coalescing `t("search") ?? "Search"` → `t("search")`
  - [L2] Not fixed (deferred): Search placeholder `<div>` keyboard accessibility — placeholder will be replaced with real search in future story
  - Added `Common.tryAgain` key to both en.json and ig.json
  - All 213 tests pass after fixes

### File List

messages/en.json
messages/ig.json
src/i18n/routing.ts
src/i18n/routing.test.ts
src/i18n/request.ts
src/i18n/navigation.ts
src/middleware.ts
src/middleware.test.ts
src/app/layout.tsx
src/app/page.tsx
src/app/manifest.ts
src/app/manifest.test.ts
src/app/sw.ts
src/app/[locale]/layout.tsx
src/app/[locale]/page.tsx
src/app/[locale]/not-found.tsx
src/app/[locale]/error.tsx
src/app/[locale]/(app)/layout.tsx
src/app/[locale]/(guest)/layout.tsx
src/app/[locale]/(auth)/layout.tsx
src/app/[locale]/(admin)/layout.tsx
src/app/[locale]/~offline/page.tsx
src/app/[locale]/~offline/page.test.tsx
src/components/layout/AppShell.tsx
src/components/layout/AppShell.test.tsx
src/components/layout/TopNav.tsx
src/components/layout/TopNav.test.tsx
src/components/layout/BottomNav.tsx
src/components/layout/BottomNav.test.tsx
src/components/layout/GuestShell.tsx
src/components/layout/GuestShell.test.tsx
src/components/layout/GuestNav.tsx
src/components/layout/GuestNav.test.tsx
src/components/layout/Footer.tsx
src/components/shared/ContrastToggle.tsx
src/components/shared/LanguageToggle.tsx
src/components/shared/LanguageToggle.test.tsx
next.config.ts
next.config.test.ts
tsconfig.json
package.json
.gitignore
public/icons/icon-192.png
public/icons/icon-512.png
