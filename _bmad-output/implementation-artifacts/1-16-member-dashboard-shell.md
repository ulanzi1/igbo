# Story 1.16: Member Dashboard Shell

Status: done

## Story

As a member,
I want a well-structured dashboard that serves as my home page after login,
So that I can see relevant community activity, my stats, and quick actions in one place.

## Acceptance Criteria

### AC1: Dashboard Layout Shell

- **Given** an authenticated member navigates to the home page (post-login or `/[locale]/dashboard`)
- **When** the dashboard loads
- **Then** the system renders the dashboard layout with defined widget slots:
  - **Greeting header:** Personalized greeting in the selected language ("Nno, [Name]" for Igbo, "Welcome home, [Name]" for English) with the member's avatar and unread notifications count (from `useNotifications()`)
  - **Primary content area:** "Getting started" empty state (for Epic 1 deployment — News feed placeholder from Story 4.1 not yet available)
  - **Sidebar widgets (desktop) / stacked sections (mobile):** All hidden for Epic 1 deployment since backing features (Stories 3.3, 7.2, 8.2, 10.3, 6.2) haven't shipped

### AC2: Responsive Layout

- **Given** the dashboard renders on different screen sizes
- **When** the layout reflows
- **Then** desktop (>1024px) displays a two-column layout: primary content left (65%) + stacked sidebar widgets right (35%)
- **And** tablet (768–1024px) displays a single column with widgets collapsed into horizontally scrollable cards below primary content
- **And** mobile (<768px) displays a single column with widgets stacked vertically, each collapsible with a section header

### AC3: New Member Getting-Started Empty State

- **Given** a member has no content in the primary area (feed/connections not yet available in Epic 1)
- **When** they view the dashboard
- **Then** a "getting started" empty state fills the primary content area with warm messaging and next-action suggestions: "Join a group," "Complete your profile," "Explore the member directory"
- **And** widget slots that have no backing feature yet are **hidden entirely** (not rendered as empty skeletons) — the layout adapts to available widgets only

### AC4: Skeleton Loading States

- **Given** widget data loads asynchronously
- **When** the dashboard shell renders
- **Then** the layout shell renders immediately with warm grey pulse skeleton loading states for each widget slot
- **And** each widget loads independently — a slow widget does not block others

### AC5: Feature-Flagged Widget Visibility

- **Given** widget slots whose backing feature has not yet shipped
- **When** the dashboard renders
- **Then** those widget slots are **hidden entirely** (not rendered, not shown as empty skeletons)
- **And** for the initial Epic 1 deployment, the dashboard renders: greeting header (always), getting started empty state (primary content), and notification unread count in the greeting — no sidebar widgets shown
- **And** the `WidgetSlot` component accepts an `enabled` prop; when `enabled={false}` it renders `null`

### AC6: i18n Bilingual Support

- **Given** the member has a language preference (English or Igbo)
- **When** the dashboard renders
- **Then** the greeting is rendered in the correct language ("Nno, [Name]" / "Welcome home, [Name]")
- **And** all UI strings use the `Dashboard` i18n namespace with `useTranslations("Dashboard")`
- **And** new keys are added to both `messages/en.json` and `messages/ig.json`

## Tasks / Subtasks

### Task 1: Route Page (AC: #1, #6)

- [x] 1.1 Create `src/app/[locale]/(app)/dashboard/page.tsx` — Server Component; calls `auth()` from `@/server/auth/config`, passes session data (name, locale, image) as props to `DashboardShell`; redirects to `/login` if unauthenticated
- [x] 1.2 Add `generateMetadata` export to the page using `getTranslations({ namespace: "Dashboard" })`
- [x] 1.3 Call `setRequestLocale(locale)` at the top of the page (next-intl server requirement)

### Task 2: Feature Module Structure (AC: #1, #2, #3, #4, #5)

- [x] 2.1 Create `src/features/dashboard/components/DashboardShell.tsx` — Client Component (`"use client"`); renders the two-column / single-column responsive layout; accepts `displayName`, `locale`, `avatarUrl?` props; composes `DashboardGreeting` + `WidgetSlot` children
- [x] 2.2 Create `src/features/dashboard/components/DashboardGreeting.tsx` — Client Component; shows personalized greeting via `t("greeting.welcome", { name })` (next-intl auto-selects locale — en.json has English, ig.json has Igbo), avatar (initial fallback if no image), unread notification count from `useNotifications()`; greeting renders as `<h1>`, notification count uses `aria-live="polite"`; shows skeleton while loading
- [x] 2.3 Create `src/features/dashboard/components/WidgetSlot.tsx` — Client Component; accepts `enabled: boolean`, `title: string`, `children: React.ReactNode`; when `enabled=false` renders `null`; when loading renders a `Skeleton` pulse (warm grey, card-shaped per UX spec); wraps children in a React error boundary (inline class component) that catches render errors and shows a `Card` with `t("widget.error")` fallback message
- [x] 2.4 Create `src/features/dashboard/components/GettingStartedWidget.tsx` — Client Component; the primary content "getting started" empty state with action links ("Join a group" → `/groups`, "Complete your profile" → `/settings/profile`, "Explore members" → `/discover`); uses `useTranslations("Dashboard")`; all link text i18n keyed
- [x] 2.5 Create `src/features/dashboard/index.ts` — barrel export for all public components (`DashboardShell`, `DashboardGreeting`, `WidgetSlot`, `GettingStartedWidget`) per architecture rule #3

### Task 3: i18n Keys (AC: #6)

- [x] 3.1 Add `Dashboard` namespace to `messages/en.json`:
  ```json
  "Dashboard": {
    "pageTitle": "Home",
    "greeting": {
      "welcome": "Welcome home, {name}",
      "subtitle": "Here's what's happening in your community"
    },
    "gettingStarted": {
      "title": "Welcome to OBIGBO",
      "subtitle": "You're part of something special. Here's how to get started:",
      "joinGroup": "Join a group",
      "joinGroupDesc": "Find your people — hometown, profession, or interest",
      "completeProfile": "Complete your profile",
      "completeProfileDesc": "Help others find and connect with you",
      "exploreMembers": "Explore members",
      "exploreMembersDesc": "Discover community members near you"
    },
    "stats": {
      "notifications": "{count} unread notifications",
      "noNotifications": "No new notifications"
    },
    "widget": {
      "error": "Something went wrong loading this section"
    }
  }
  ```
- [x] 3.2 Add `Dashboard` namespace to `messages/ig.json`:
  ```json
  "Dashboard": {
    "pageTitle": "Ụlọ",
    "greeting": {
      "welcome": "Nnọ, {name}",
      "subtitle": "Ihe na-eme n'obodo gị"
    },
    "gettingStarted": {
      "title": "Nnọọ na OBIGBO",
      "subtitle": "Ị bụ akụkụ nke ihe pụrụ iche. Otu esi amalite:",
      "joinGroup": "Sonyere otu",
      "joinGroupDesc": "Chọta ndị gị — obodo, ọrụ, ma ọ bụ mmasị",
      "completeProfile": "Mejupụta profaịlụ gị",
      "completeProfileDesc": "Nyere ndị ọzọ aka ịchọta ma jikọọ na gị",
      "exploreMembers": "Chọgharịa ndị otu",
      "exploreMembersDesc": "Chọpụta ndị obodo nọ gị nso"
    },
    "stats": {
      "notifications": "{count} ozi a na-agụbeghị",
      "noNotifications": "Enweghị ozi ọhụrụ"
    },
    "widget": {
      "error": "Ihe adaghị nke ọma n'ibugo akụkụ a"
    }
  }
  ```

### Task 4: Tests (AC: all)

- [x] 4.1 `src/app/[locale]/(app)/dashboard/page.test.tsx` — smoke test: mock `auth()`, `setRequestLocale`, `getTranslations`; assert it renders `DashboardShell` with correct props; test unauthenticated redirect
- [x] 4.2 `src/features/dashboard/components/DashboardShell.test.tsx` — test responsive layout renders, passes props to greeting and slot children
- [x] 4.3 `src/features/dashboard/components/DashboardGreeting.test.tsx` — test greeting rendering with `t("greeting.welcome")`, notification count display (mock `useNotifications`), skeleton during loading, greeting renders as `<h1>`, notification count element has `aria-live="polite"`
- [x] 4.4 `src/features/dashboard/components/WidgetSlot.test.tsx` — test `enabled=false` renders null, `enabled=true` renders children, skeleton in loading state, error boundary catches child render error and shows fallback card
- [x] 4.5 `src/features/dashboard/components/GettingStartedWidget.test.tsx` — test all three action links render with correct hrefs, i18n text, accessibility

## Dev Notes

### Critical: Dashboard Route Location

The dashboard lives at `src/app/[locale]/(app)/dashboard/page.tsx` — confirmed by:

- `src/middleware.test.ts`: middleware tests check `/en/dashboard` access
- `src/app/[locale]/(app)/onboarding/page.tsx` line 43: `redirect({ href: "/dashboard", locale })`
- The `(app)` route group uses `AppShell` layout (already has `SocketProvider`, `QueryClientProvider`, `TopNav`, `BottomNav`)

### Architecture: No New `(app)` Route Group Changes

The `src/app/[locale]/(app)/layout.tsx` already wraps with `AppShell` which provides `SocketProvider`, `QueryClientProvider`, `TopNav`, and `BottomNav`. No layout changes needed — just add `dashboard/page.tsx`.

### How to Get Greeting Name (Server Side)

In `dashboard/page.tsx` (Server Component):

```ts
const session = await auth();
// session.user.name comes from authUsers.name (set during onboarding as displayName)
// session.user.image is the avatar URL (from communityProfiles.photoUrl or null)
```

Pass these down as props to `DashboardShell`. Do NOT fetch community profile server-side — use what's in the session token (already populated by the Auth.js callbacks from Story 1.7).

### Greeting i18n — Standard next-intl Pattern

Do NOT manually check locale to pick a greeting key. Use a single key `greeting.welcome` with different translations per locale file:

- `en.json`: `"welcome": "Welcome home, {name}"`
- `ig.json`: `"welcome": "Nnọ, {name}"`

Code: `t("greeting.welcome", { name: displayName })` — next-intl selects the correct locale file based on the URL param automatically. No `useLocale()` check needed for the greeting.

### Accessibility Requirements (UX Spec)

- `DashboardGreeting` greeting text renders as `<h1>` (page heading per UX spec: "Greeting is heading level 1")
- Notification count element uses `aria-live="polite"` so screen readers announce updates
- Getting-started action buttons use `Button` component (44px min-height touch targets already enforced)
- Empty state heading is a semantic heading (`<h2>`)

### Unread Count in Greeting

`DashboardGreeting` uses `useNotifications()` from `@/hooks/use-notifications` for the unread count. This hook is already used by `NotificationBell` in TopNav. Both can coexist — they share the same TanStack Query cache key (`["notifications"]`), so only one API call is made regardless.

### Widget Feature Flagging

Use a simple `enabled` prop on `WidgetSlot`. The dashboard page hardcodes which widgets are enabled based on what's shipped:

```tsx
// Epic 1: only greeting + getting started content; no sidebar widgets
<WidgetSlot enabled={false} title={t("widgets.peopleNearYou")}> ... </WidgetSlot>
<WidgetSlot enabled={false} title={t("widgets.groups")}> ... </WidgetSlot>
```

As later epics ship, their story updates the `enabled` value to `true`. **Do NOT use environment variables or dynamic API checks for feature flagging** — that complexity is not justified here.

### shadcn/ui Components to Use

- `Skeleton` from `@/components/ui/skeleton` — warm grey pulse, card-shaped (UX spec: "Warm grey (`--muted`), card-shaped, pulse animation")
- `Card`, `CardHeader`, `CardContent` from `@/components/ui/card` — for widget containers and getting-started card (warm white background, 12px radius, subtle warm shadow)
- `Avatar`, `AvatarImage`, `AvatarFallback` from `@/components/ui/avatar` — already exists with custom `size` prop:
  ```tsx
  // Use size="lg" (56px) in the greeting header
  <Avatar size="lg">
    <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
    <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
  </Avatar>
  ```
  The `AvatarFallback` renders `bg-primary text-primary-foreground` initials automatically — no custom styling needed.
- `Button` (rounded, min-height 44px) — for getting-started action links styled as buttons

### Responsive Layout CSS

Per UX spec (desktop 65/35, mobile vertical stack):

```tsx
// DashboardShell.tsx layout
<div className="container mx-auto px-4 py-6">
  <DashboardGreeting ... />
  <div className="mt-6 flex flex-col lg:flex-row gap-6">
    {/* Primary content — full width when no sidebar, 65% when sidebar active */}
    <main className={hasEnabledWidgets ? "lg:w-[65%]" : "w-full"}>
      <GettingStartedWidget />
    </main>
    {/* Sidebar — only render the <aside> element when at least one widget is enabled */}
    {hasEnabledWidgets && (
      <aside className="lg:w-[35%] flex flex-col gap-4">
        {/* WidgetSlots */}
      </aside>
    )}
  </div>
</div>
```

Compute `hasEnabledWidgets` as a simple boolean (hardcoded `false` for Epic 1). This prevents an empty `<aside>` from creating dead whitespace. Tablet widget layout deferred — all sidebar widgets disabled in Epic 1.

### Testing Patterns from Story 1.15

- Mock `@/hooks/use-notifications` for components that use `useNotifications()`:
  ```ts
  vi.mock("@/hooks/use-notifications", () => ({
    useNotifications: () => ({ notifications: [], unreadCount: 3, isLoading: false, error: null }),
  }));
  ```
- Mock `next-auth/react` (for `useSession`) if `DashboardGreeting` uses it: follow same pattern as `AppShell.test.tsx`
- Mock `next-intl` hooks (`useTranslations`, `useLocale`) using the existing pattern in layout tests
- Page-level tests (Server Components): mock `@/server/auth/config` + `next-intl/server` functions
- Components under `src/features/dashboard/` are client components → no `@vitest-environment node` directive needed (default jsdom)

### Pre-Existing Test Failure

`ProfileStep.test.tsx` has 1 failure since Story 1.9 — do NOT investigate.

### File Structure

```
src/
├── app/[locale]/(app)/dashboard/
│   ├── page.tsx                         # Server Component — dashboard route
│   └── page.test.tsx                    # Smoke test
└── features/dashboard/
    ├── components/
    │   ├── DashboardShell.tsx           # Main responsive layout wrapper
    │   ├── DashboardShell.test.tsx
    │   ├── DashboardGreeting.tsx        # Personalized greeting + stats
    │   ├── DashboardGreeting.test.tsx
    │   ├── WidgetSlot.tsx               # Generic slot w/ skeleton + enabled prop
    │   ├── WidgetSlot.test.tsx
    │   ├── GettingStartedWidget.tsx     # Empty state primary content
    │   └── GettingStartedWidget.test.tsx
    └── index.ts                         # Barrel export
```

### Cross-Story Notes

- **Story 1.17 (Email Service):** Independent — no overlap
- **Story 3.3 (People Near You widget):** That story will import `WidgetSlot` from `@/features/dashboard` and render its content inside; it will flip `enabled=true` on that slot
- **Story 4.1 (News Feed):** Will replace `GettingStartedWidget` in the primary content area for members with connections
- **Story 8.2 (Points widget):** Will render inside a `WidgetSlot` for the points balance display
- **Story 2.1 (Chat):** Uses `SocketProvider` (already in AppShell) — no dashboard changes needed

### i18n Keys Location in en.json

Currently `en.json` has `Onboarding.sections.dashboard` (the tour step description). The new `Dashboard` namespace is SEPARATE — at root level, not nested under `Onboarding`. Do not conflate them.

### Project Structure Notes

- `features/dashboard/` is a new feature module NOT listed explicitly in `architecture.md` features directory (which was written before Story 1.16's scope was finalized). The epics.md acceptance criteria is authoritative: "the developer creates the `features/dashboard` module." Follow the established feature module pattern: `components/`, `index.ts` barrel.
- No `actions/` or `hooks/` subdirectory needed for Epic 1 — the dashboard is purely presentational at this stage
- No DB migrations needed for this story

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.16 acceptance criteria, lines 1272–1315]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Dashboard Emotional Design ("Home, Not Homepage"), line 197]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Component specs: Skeleton, Card, EventCard widget variant, lines 1587–1627]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Two-Tap-to-Value Rule, line 1593]
- [Source: _bmad-output/planning-artifacts/architecture.md — (app) route group, lines 737–763]
- [Source: _bmad-output/planning-artifacts/architecture.md — Agent Rules (10 mandatory), lines 645–669]
- [Source: _bmad-output/implementation-artifacts/1-15-socket-io-realtime-server-core-notification-infrastructure.md — Dev Notes re Story 1.16 consumption of useNotifications, line 273]
- [Source: src/middleware.ts + src/middleware.test.ts — /dashboard route confirmed as protected app route]
- [Source: src/app/[locale]/(app)/onboarding/page.tsx line 43 — redirect to /dashboard after onboarding]
- [Source: src/hooks/use-notifications.ts — useNotifications() API: returns {notifications, unreadCount, isLoading, error}]
- [Source: src/components/layout/AppShell.tsx — QueryClientProvider + SocketProvider already wrapping all (app) routes]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented dashboard route at `src/app/[locale]/(app)/dashboard/page.tsx` as a Server Component using `auth()` + `redirect()` for auth guard; passes session name/image to `DashboardShell`
- Created `features/dashboard/` module with four client components: `DashboardShell`, `DashboardGreeting`, `WidgetSlot`, `GettingStartedWidget`
- `DashboardShell` computes `hasEnabledWidgets = false` (constant for Epic 1) so no sidebar `<aside>` is rendered; primary content is `w-full`
- `DashboardGreeting` uses `useNotifications()` for unread count (shares TanStack Query cache with `NotificationBell`), shows Skeleton while loading, greeting as `<h1>`, count element has `aria-live="polite"`
- `WidgetSlot` has inline `WidgetErrorBoundary` class component; renders `null` when `enabled=false`, `Skeleton` when `loading=true`, otherwise error-bounded children
- `GettingStartedWidget` renders three i18n-keyed action links (`/groups`, `/settings/profile`, `/discover`) with `Button asChild` + next-intl `Link`
- Added `Dashboard` i18n namespace to both `messages/en.json` and `messages/ig.json` (Igbo: "Nnọ, {name}" greeting, translated getting-started strings)
- 33 new tests (5+6+8+6+8) all pass; full regression suite 897/897 green

### File List

- `src/app/[locale]/(app)/dashboard/page.tsx` (new)
- `src/app/[locale]/(app)/dashboard/page.test.tsx` (new)
- `src/features/dashboard/components/DashboardShell.tsx` (new)
- `src/features/dashboard/components/DashboardShell.test.tsx` (new)
- `src/features/dashboard/components/DashboardGreeting.tsx` (new)
- `src/features/dashboard/components/DashboardGreeting.test.tsx` (new)
- `src/features/dashboard/components/WidgetSlot.tsx` (new)
- `src/features/dashboard/components/WidgetSlot.test.tsx` (new)
- `src/features/dashboard/components/GettingStartedWidget.tsx` (new)
- `src/features/dashboard/components/GettingStartedWidget.test.tsx` (new)
- `src/features/dashboard/index.ts` (new)
- `messages/en.json` (modified — added `Dashboard` namespace)
- `messages/ig.json` (modified — added `Dashboard` namespace)

## Senior Developer Review (AI)

**Reviewer:** Dev (adversarial code review)
**Date:** 2026-02-26
**Model:** claude-opus-4-6

### Findings (7 total: 1 High, 4 Medium, 2 Low)

#### Fixed (5 issues — all HIGH + MEDIUM)

1. **[HIGH] `greeting.subtitle` i18n key defined but never rendered** — Task 3.1 specified `greeting.subtitle` in both en.json and ig.json, but `DashboardGreeting.tsx` never called `t("greeting.subtitle")`. **Fix:** Added subtitle rendering as `<p>` between the h1 greeting and notification count.

2. **[MEDIUM] DashboardGreeting unnecessarily skeletonized server-provided data** — Entire greeting (avatar, name, count) was replaced with skeleton when `isLoading` was true, but `displayName` and `avatarUrl` are server props available immediately. **Fix:** Greeting + avatar now always render; only the notification count line shows inline skeleton during loading.

3. **[MEDIUM] Unused `locale` prop in DashboardShell** — Interface declared `locale: string` but the function never used it (`useTranslations` handles locale automatically). **Fix:** Removed `locale` from `DashboardShellProps`, removed from `page.tsx` prop passing, updated all tests.

4. **[MEDIUM] Silent `WidgetErrorBoundary.componentDidCatch`** — Widget render errors were silently swallowed with zero observability. **Fix:** Added `console.error("[WidgetSlot] Widget render error:", error, info.componentStack)`.

5. **[MEDIUM] `generateMetadata` untested** — The `generateMetadata` export on `page.tsx` had no test coverage. **Fix:** Added test verifying it returns `{ title: "pageTitle" }` from Dashboard namespace translations.

#### Not Fixed (2 LOW issues — acceptable as-is)

6. **[LOW] Weak `avatarUrl` test assertion** — `DashboardShell.test.tsx` only tests `expect(() => render(...)).not.toThrow()` for `avatarUrl` prop. Acceptable for Epic 1 where avatar passthrough is simple.

7. **[LOW] GettingStartedWidget Buttons use default variant** — Three stacked primary buttons may create visual weight; `outline` or `secondary` variant could be more appropriate for exploratory actions. Deferred to UX polish pass.

### Test Results After Fixes

- **899/899 passing** (+2 new tests: `generateMetadata`, `greeting.subtitle`)
- 130 test files, all green

### Verdict: APPROVED

All HIGH and MEDIUM issues fixed. Story status updated to `done`.

## Change Log

- 2026-02-25: Implemented Story 1.16 — dashboard route, feature module (DashboardShell, DashboardGreeting, WidgetSlot, GettingStartedWidget), i18n keys (en+ig), 33 tests. All 897 tests green.
- 2026-02-26: Code review fixes — rendered greeting.subtitle, fixed loading skeleton UX (only skeleton notification count), removed unused locale prop, added error logging to WidgetErrorBoundary, added generateMetadata test. 899/899 tests green (+2 new).
