---
title: 'Portal Role Selection — Choose Your Path'
slug: 'prep-d-portal-role-selection'
created: '2026-04-05'
status: 'Done'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack: ['next.js 16.1.x', 'next-auth v5 (@igbo/auth)', 'drizzle ORM (@igbo/db)', 'next-intl', 'shadcn/ui new-york', 'vitest 4', '@testing-library/react', 'zod/v4']
files_to_modify:
  - 'apps/portal/src/app/[locale]/layout.tsx — refactor to providers-only (remove PortalLayout)'
  - 'apps/portal/src/app/[locale]/layout.test.tsx — update for providers-only layout'
  - 'apps/portal/src/hooks/use-active-portal-role.ts — fix null-masking'
  - 'apps/portal/src/hooks/use-active-portal-role.test.ts — update 1 assertion'
  - 'apps/portal/src/components/layout/role-switcher.tsx — add allRoles.length===0 guard'
  - 'apps/portal/messages/en.json — add Portal.chooseRole.* keys'
  - 'apps/portal/messages/ig.json — add Portal.chooseRole.* keys'
files_to_create:
  - 'apps/portal/src/app/[locale]/(gated)/layout.tsx — role gate + PortalLayout'
  - 'apps/portal/src/app/[locale]/(gated)/layout.test.tsx — gate tests'
  - 'apps/portal/src/app/[locale]/(ungated)/choose-role/page.tsx — server component (auth guard + redirect)'
  - 'apps/portal/src/app/[locale]/(ungated)/choose-role/page.test.tsx — page tests'
  - 'apps/portal/src/components/choose-role/choose-role-form.tsx — client component (buttons + API + session refresh)'
  - 'apps/portal/src/components/choose-role/choose-role-form.test.tsx — form tests'
  - 'apps/portal/src/app/api/v1/portal/role/select/route.ts — role selection API'
  - 'apps/portal/src/app/api/v1/portal/role/select/route.test.ts — route tests'
files_to_move:
  - 'apps/portal/src/app/[locale]/page.tsx → (gated)/page.tsx'
  - 'apps/portal/src/app/[locale]/page.test.tsx → (gated)/page.test.tsx'
  - 'apps/portal/src/app/[locale]/onboarding/ → (gated)/onboarding/'
  - 'apps/portal/src/app/[locale]/my-jobs/ → (gated)/my-jobs/'
  - 'apps/portal/src/app/[locale]/jobs/ → (gated)/jobs/'
  - 'apps/portal/src/app/[locale]/company-profile/ → (gated)/company-profile/'
  - 'apps/portal/src/app/[locale]/companies/ → (gated)/companies/'
code_patterns:
  - 'route-group-gating — (gated)/ vs (ungated)/ under [locale]/'
  - 'withApiHandler(handler) — portal API middleware with CSRF, traceId, ApiError catch'
  - 'throw ApiError({title, status, detail?, extensions?}) — never return errorResponse() from routes'
  - 'successResponse(data, meta?, status?) — RFC 7807 envelope'
  - 'requireEmployerRole() / requireJobSeekerRole() — auth + role check, throws ApiError'
  - 'auth() from @igbo/auth — server-side session, returns session.user.portalRoles[]'
  - 'useSession().update({activePortalRole}) — triggers JWT callback re-fetch'
  - 'getPlatformSetting<T>(key, fallback) — no seed needed, fallback is default'
  - 'getRoleByName(name) → AuthRole | null — from @igbo/db/queries/auth-permissions'
  - 'assignUserRole(userId, roleId, assignedBy?) → void — onConflictDoNothing'
  - 'PortalLayout is "use client" — TopNav + main + BottomNav wrapper'
  - 'Server pages use setRequestLocale(locale) + getTranslations(namespace)'
test_patterns:
  - 'axe-core: expect.extend(toHaveNoViolations), // @ts-ignore before assertion'
  - 'mock auth(): vi.mock("@igbo/auth", () => ({ auth: vi.fn() }))'
  - 'mock useSession: vi.mock("next-auth/react", () => ({ useSession: vi.fn(), SessionProvider: ... }))'
  - 'server component tests: const jsx = await Page({params: Promise.resolve({locale:"en"})}); render(jsx)'
  - 'API route tests: call exported POST/GET directly with new Request(url, {method, headers, body})'
  - 'portal route tests mock auth() + @igbo/db query functions, call handler with Request + check Response'
---

# Tech-Spec: Portal Role Selection — "Choose Your Path"

**Created:** 2026-04-05

## Overview

### Problem Statement

Community members arriving at the portal with no portal roles have no self-service path to become employers or seekers. Role assignment currently requires direct DB intervention. Additionally, `useActivePortalRole` silently masks `null` as `JOB_SEEKER` when `allRoles` is empty, hiding the no-role state from all downstream consumers and making it impossible to distinguish "actual seeker" from "no role assigned."

### Solution

1. **Route group architecture** — split `[locale]/` into `(gated)/` (role gate + full PortalLayout) and `(ungated)/` (minimal layout for `/choose-role`). Root `[locale]/layout.tsx` keeps shared providers only.
2. **"Choose Your Path" page** (`/[locale]/choose-role`) in `(ungated)/` presenting Employer and Job Seeker cards. **Server-side guard:** if user already has portal roles, redirect to `/{locale}` — prevents re-entry and duplicate assignment attempts.
3. **`POST /api/v1/portal/role/select`** route that assigns the chosen role via existing `assignUserRole` + `getRoleByName` in `@igbo/db`. Auto-approves employer by default (controlled by `platformSettings` key `portal_employer_auto_approve`, defaulting to `true`). Validates against `SELF_SERVICE_ROLES` allowlist (`["JOB_SEEKER", "EMPLOYER"]`). Returns 409 if user already has ANY portal role (first-time selection only — prevents dual-tab race conditions). Returns 400 if role is `JOB_ADMIN` or invalid.
4. **Gated layout** (`(gated)/layout.tsx`) redirects authenticated no-role users to `/choose-role`. Unauthenticated users pass through (guest browsing). Users with roles render normally.
5. **Fix `useActivePortalRole`** to return `role: null` when `allRoles.length === 0`, and update downstream consumers.
6. **Session refresh** after role assignment: client calls `update({ activePortalRole })` from `useSession()` hook result to trigger JWT callback re-fetch from DB. Read-after-write consistency assumed (single Postgres instance, synchronous commit).

### Scope

**In Scope:**
- Route group restructure: `(gated)/` and `(ungated)/` under `[locale]/`
- "Choose Your Path" page with Employer / Seeker cards (bilingual via next-intl)
- Choose Your Path server-side guard: redirect to `/{locale}` if user already has roles
- `POST /api/v1/portal/role/select` route with `SELF_SERVICE_ROLES` allowlist + 409 any-role guard
- Gated layout with role gate (redirect no-role authenticated users to `/choose-role`)
- Fix `useActivePortalRole` hook: `null` role when `allRoles.length === 0`
- `RoleSwitcher` guard: render nothing when `isAuthenticated && allRoles.length === 0`
- Session refresh via `update()` after role assignment
- Page metadata for Choose Your Path (`generateMetadata` with i18n)
- i18n keys for both `en.json` and `ig.json`
- Full test coverage (unit + component + axe-core a11y)

**Out of Scope:**
- JOB_ADMIN self-service (admin-assigned only)
- `middleware.ts` addition (route group gating is sufficient)
- Admin approval workflow when `portal_employer_auto_approve` is `false` (future story)
- Reading `platformSettings` key in route code (deferred — see Notes)
- Seeker onboarding flow (future epic)
- Admin UI for toggling `portal_employer_auto_approve`
- "Add Role" flow from portal settings (future — multi-role users get roles through admin or future self-service)

## Context for Development

### Codebase Patterns

- Portal API routes use `withApiHandler()` from `@/lib/api-middleware` — handles CSRF validation, traceId enrichment, and ApiError catch
- Portal permissions: `requireEmployerRole()`, `requireJobSeekerRole()` in `src/lib/portal-permissions.ts` — each calls `auth()` + checks `activePortalRole`
- Role DB operations: `getRoleByName(name) → AuthRole | null` and `assignUserRole(userId, roleId, assignedBy?) → void` (uses `onConflictDoNothing`) in `@igbo/db/queries/auth-permissions`
- `getUserPortalRoles(userId) → PortalRole[]` — filters `auth_user_roles` join to portal role names
- Platform settings: `getPlatformSetting<T>(key, fallback)` in `@igbo/db/queries/platform-settings` — no seed row needed, fallback is the default
- JWT callback in `packages/auth/src/config.ts` — `trigger === "update"` path re-fetches `portalRoles` via `getUserPortalRoles()` and validates requested `activePortalRole` against actual roles (fail-closed)
- Session callback: `session.user.portalRoles = token.portalRoles ?? []` — always an array, never undefined
- Session update from client: `const { data: session, update } = useSession()` — `update()` is on the hook result, NOT on session data
- i18n: All user-facing strings via `useTranslations()` (client) or `getTranslations()` (server) with `Portal.*` namespace
- `PortalLayout` is a `"use client"` 16-line wrapper: `<PortalTopNav /> + <main> + <PortalBottomNav />`
- Server pages use `setRequestLocale(locale)` + `getTranslations(namespace)` pattern
- Error format: `throw new ApiError({ title, status, detail?, extensions? })` — `withApiHandler` converts to RFC 7807
- Success format: `successResponse(data, meta?, status?)` — returns `{ data }` envelope

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/portal/src/app/[locale]/layout.tsx` | Root locale layout — currently has PortalLayout + providers. Refactor to providers-only. |
| `apps/portal/src/app/[locale]/layout.test.tsx` | Tests DensityProvider integration. Update to remove PortalLayout mock. |
| `apps/portal/src/hooks/use-active-portal-role.ts` | Hook with null-masking bug — line 36: ternary defaults to `"JOB_SEEKER"` when `rawRole` is undefined/null. |
| `apps/portal/src/hooks/use-active-portal-role.test.ts` | Line 77-83: "defaults to JOB_SEEKER" test must flip to assert `role: null`. |
| `apps/portal/src/components/layout/role-switcher.tsx` | Line 44: `activeLabel` falls back to `t("seeker")` for null role. Add `allRoles.length === 0` early return. |
| `apps/portal/src/components/layout/portal-top-nav.tsx` | Consumer — lines 58-64 ternary falls through to `guestLinks`. **No change needed.** |
| `apps/portal/src/components/layout/portal-bottom-nav.tsx` | Consumer — lines 82-88 same ternary. **No change needed.** |
| `apps/portal/src/components/layout/portal-layout.tsx` | 16-line `"use client"` wrapper (TopNav + main + BottomNav). Imported by `(gated)/layout.tsx`. |
| `apps/portal/src/lib/api-middleware.ts` | `withApiHandler(handler, options?)` — CSRF + traceId + ApiError catch. |
| `apps/portal/src/lib/api-error.ts` | Re-exports `ApiError` from `@igbo/auth/api-error`. |
| `apps/portal/src/lib/api-response.ts` | `successResponse()`, `errorResponse()`. |
| `apps/portal/src/lib/portal-permissions.ts` | `requireEmployerRole()` etc. — NOT used by new route (it needs auth-only, no specific role). |
| `apps/portal/src/app/api/v1/companies/route.ts` | Reference for API route pattern: `withApiHandler`, `throw ApiError`, `successResponse`. |
| `packages/db/src/queries/auth-permissions.ts` | `getRoleByName()`, `assignUserRole()`, `getUserPortalRoles()`. |
| `packages/db/src/queries/platform-settings.ts` | `getPlatformSetting<T>(key, fallback)`. |
| `packages/auth/src/config.ts` | JWT callback — `trigger === "update"` re-fetches portalRoles. Session callback: `portalRoles = token.portalRoles ?? []`. |
| `packages/auth/src/portal-role.ts` | `PortalRole` type: `"JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN"`. |
| `apps/portal/messages/en.json` | i18n keys — `Portal.*` namespace, nested object structure. |

### Technical Decisions

- **Route group architecture over middleware/pathname detection:** `(gated)/` layout has role gate + PortalLayout. `(ungated)/` has minimal layout for `/choose-role`. Root `[locale]/layout.tsx` is providers-only. No URL parsing hacks, no middleware.ts needed. Next.js App Router idiomatic pattern for conditional layouts.
- **Auth flow clarification:** Unauthenticated → no portal middleware exists, guests browse freely (guestLinks in nav). Authenticated + no roles → gated layout redirects to `/choose-role`. Authenticated + has role → normal rendering.
- **Auto-approve default (deferred read):** The intended mechanism is `getPlatformSetting("portal_employer_auto_approve", true)`. This spec always auto-approves — the `getPlatformSetting` read is deferred to the future story that adds the admin toggle + 202 "pending approval" response + client handling. No dead code.
- **SELF_SERVICE_ROLES allowlist:** `["JOB_SEEKER", "EMPLOYER"] as const` — route rejects anything not in this set with 400. JOB_ADMIN explicitly excluded from self-service.
- **409 any-role guard:** `POST /api/v1/portal/role/select` rejects with 409 Conflict if user already has ANY portal role (not just the requested one). Choose Your Path is first-time selection only. Adding additional roles later is a separate flow (future "Add Role" in settings). Prevents dual-tab race conditions where Tab A picks Employer and Tab B picks Seeker simultaneously.
- **Choose Your Path server guard:** `if (session && portalRoles.length > 0) redirect(/{locale})` — prevents re-entry after role selection and duplicate assignment attempts.
- **Server/client component split for Choose Your Path:** `page.tsx` is a server component (handles auth check + already-has-role redirect authoritatively, no flash of wrong content). Embeds a `ChooseRoleForm` client component for interactive bits (button clicks → API call → `useSession().update()` → client-side redirect). Matches existing portal pattern (`onboarding/page.tsx` delegates to client forms).
- **Hook fix is prerequisite:** `useActivePortalRole` returning `null` for no-role users is required before the layout gate and Choose Your Path page can function correctly.
- **Read-after-write consistency assumed:** Single Postgres instance, synchronous commit. JWT callback reads role immediately after route handler writes it. Document this assumption for future multi-replica scenarios.

### Route Group Structure

```
apps/portal/src/app/[locale]/
├── layout.tsx                  ← providers only (SessionProvider, DensityProvider, NextIntlClientProvider, Toaster)
├── (gated)/
│   ├── layout.tsx              ← role gate + PortalLayout (TopNav + BottomNav + main)
│   ├── page.tsx                ← home (moved from [locale]/)
│   ├── page.test.tsx
│   ├── dashboard/
│   ├── my-jobs/
│   ├── jobs/
│   ├── onboarding/
│   ├── company-profile/
│   └── companies/
└── (ungated)/
    └── choose-role/
        ├── page.tsx            ← server component (auth guard + ChooseRoleForm embed)
        └── page.test.tsx
```

**Import paths unaffected:** Route groups are invisible to imports. All `@/` aliases resolve to `src/` regardless of route group nesting.

### Consumer Impact Analysis (useActivePortalRole fix)

| Consumer | Current behavior with `null` | After fix | Change needed? |
| -------- | ---------------------------- | --------- | -------------- |
| `portal-top-nav.tsx` | `isSeeker: true` → seekerLinks | `isSeeker: false` → guestLinks | **No** — ternary falls through correctly |
| `portal-bottom-nav.tsx` | `isSeeker: true` → seekerItems | `isSeeker: false` → guestItems | **No** — same ternary pattern |
| `role-switcher.tsx` | `role: "JOB_SEEKER"` → static badge "Seeker" | `role: null, allRoles: []` → should render nothing | **Yes** — add `if (isAuthenticated && allRoles.length === 0) return null` |

### Test Blast Radius

| Test file | Impact | Action |
| --------- | ------ | ------ |
| `use-active-portal-role.test.ts` | Line 77-83: "defaults to JOB_SEEKER" assertion | **Update** to assert `role: null, isSeeker: false` |
| `portal-layout.test.tsx` | Already mocks `role: null` | **No change** |
| All API route tests (~15 files) | Mock `auth()` directly, not the hook | **No change** |
| `portal-top-nav.test.tsx` | All tests pass explicit `activePortalRole` | **No change** |
| `portal-bottom-nav.test.tsx` | All tests pass explicit `activePortalRole` | **No change** |
| `role-switcher.test.tsx` | All tests pass explicit roles | **No change** — add 1 new test for empty allRoles guard |

## Implementation Plan

### Tasks

Tasks are ordered by dependency (lowest level first). Each task includes its test.

- [x] **Task 1: Add i18n keys for Choose Your Path page**
  - File: `apps/portal/messages/en.json`
  - Action: Add `Portal.chooseRole` namespace with all 11 keys from the i18n Key Inventory table below.
  - File: `apps/portal/messages/ig.json`
  - Action: Add same keys with Igbo translations. Use existing `Portal.role.seeker`/`Portal.role.employer` patterns for consistency. Igbo translations for new keys: `title` → "Họrọ Ụzọ Gị", `subtitle` → "Kedu ka ị ga-esi jiri OBIGBO Job Portal?", `employer.title` → "Onye Oru", `employer.description` → "Tinye ọrụ ma chọta ndị nka n'obodo Igbo.", `employer.cta` → "Malite dịka Onye Oru", `seeker.title` → "Onye Na-achọ Ọrụ", `seeker.description` → "Chọpụta ohere ma jikọọ na ụlọ ọrụ Igbo.", `seeker.cta` → "Malite dịka Onye Na-achọ Ọrụ", `addMoreLater` → "Ị nwere ike ịtụkwasị ọrụ ndị ọzọ n'oge na-adịgide.", `error` → "Ihe adịghị mma. Biko nwaa ọzọ.", `selecting` → "Na-edozi akaụntụ gị..."
  - Notes: Keys must exist before any component renders. Task 1 ensures no missing key errors during development.

- [x] **Task 2: Fix `useActivePortalRole` null-masking bug**
  - File: `apps/portal/src/hooks/use-active-portal-role.ts`
  - Action: Replace lines 33-53 (everything from `const rawRole` through the `return` statement) with the following complete block. This moves `rawPortalRoles` + `allRoles` above `role`, and makes `role` depend on `allRoles.length`:
    ```ts
    // portalRoles array: populated by JWT callback on sign-in and refreshed on role switch.
    const rawPortalRoles = (session as { user?: { portalRoles?: string[] } }).user?.portalRoles;
    const allRoles = (rawPortalRoles ?? []).filter(
      (r): r is Exclude<PortalRole, null> =>
        r === "JOB_SEEKER" || r === "EMPLOYER" || r === "JOB_ADMIN",
    );

    // activePortalRole is set by @igbo/auth JWT callback.
    // Returns null when user has no portal roles (not yet selected).
    const rawRole = (session as { user?: { activePortalRole?: string } }).user?.activePortalRole;
    const role: PortalRole = allRoles.length === 0
      ? null
      : rawRole === "EMPLOYER" ? "EMPLOYER" : rawRole === "JOB_ADMIN" ? "JOB_ADMIN" : "JOB_SEEKER";

    return {
      role,
      isSeeker: role === "JOB_SEEKER",
      isEmployer: role === "EMPLOYER",
      isAdmin: role === "JOB_ADMIN",
      isAuthenticated: true,
      allRoles,
      hasMultipleRoles: allRoles.length > 1,
    };
    ```
    Key: `rawPortalRoles` and `allRoles` are computed FIRST. The old lines 40-44 (which defined these same variables) are removed — this block replaces them entirely.
  - File: `apps/portal/src/hooks/use-active-portal-role.test.ts`
  - Action: Update test at line 77-83 ("defaults to JOB_SEEKER when activePortalRole is not set but user is authenticated"). Change expected assertions:
    ```ts
    expect(result.current.role).toBeNull();      // was: toBe("JOB_SEEKER")
    expect(result.current.isSeeker).toBe(false);  // was: toBe(true)
    ```
    Add new test: "returns null role with isAuthenticated=true when authenticated but allRoles is empty" — `mockSession({ portalRoles: [] })` → assert `role: null, isSeeker: false, isEmployer: false, isAdmin: false, isAuthenticated: true, allRoles: [], hasMultipleRoles: false`.
    Also update test at lines 127-131 ("defaults allRoles to [] when portalRoles is not in session"): currently calls `mockSession({ activePortalRole: "EMPLOYER" })` with no `portalRoles` field. After the fix, `allRoles` is `[]` so `role` becomes `null` (not `"EMPLOYER"`). Update this test's description to: "returns null role when activePortalRole set but portalRoles array missing" and add assertion `expect(result.current.role).toBeNull()`. This represents a JWT edge case (stale token with role but empty array) — the hook correctly refuses to trust `activePortalRole` without a matching `portalRoles` entry.
  - Notes: This is the prerequisite for all downstream work. Run existing hook tests after this change — expect 2 updated assertions + 1 new test passing, all others unchanged.

- [x] **Task 3: Add RoleSwitcher guard for empty allRoles**
  - File: `apps/portal/src/components/layout/role-switcher.tsx`
  - Action: After the `if (!isAuthenticated) return null;` guard (line 36), add:
    ```ts
    // No portal roles assigned yet — render nothing (user will be redirected to choose-role)
    if (allRoles.length === 0) return null;
    ```
  - File: `apps/portal/src/components/layout/role-switcher.test.tsx`
  - Action: Add new test: "renders nothing when authenticated but allRoles is empty" — `setSession({ activePortalRole: null, portalRoles: [] })` → assert component renders null (no badge, no dropdown).
  - Notes: Defense-in-depth. In practice, the gated layout redirects no-role users before they see the RoleSwitcher. But if somehow reached (e.g., session race), this prevents a misleading "Seeker" badge.

- [x] **Task 4: Refactor root `[locale]/layout.tsx` to providers-only**
  - File: `apps/portal/src/app/[locale]/layout.tsx`
  - Action: Remove `PortalLayout` import and rendering. The layout becomes:
    ```tsx
    // Keep: SessionProvider, DensityProvider, NextIntlClientProvider, SkipLink, Toaster
    // Remove: PortalLayout wrapper around {children}
    // Children render directly inside providers — PortalLayout moves to (gated)/layout.tsx
    ```
    Specifically: remove `import { PortalLayout } from "@/components/layout/portal-layout"` and change `<PortalLayout>{children}</PortalLayout>` to just `{children}`.
  - File: `apps/portal/src/app/[locale]/layout.test.tsx`
  - Action: Remove the `vi.mock("@/components/layout/portal-layout", ...)` mock. Tests now only verify DensityProvider + SessionProvider + NextIntlClientProvider behavior (which they already do). No new assertions needed.
  - Notes: SkipLink and Toaster stay in root layout — they're universal. The `(ungated)/choose-role` page inherits them.

- [x] **Task 5: Move existing pages into `(gated)/` route group**
  - Action: Create directory `apps/portal/src/app/[locale]/(gated)/` and move:
    - `page.tsx` + `page.test.tsx` → `(gated)/`
    - `onboarding/` → `(gated)/onboarding/`
    - `my-jobs/` → `(gated)/my-jobs/`
    - `jobs/` → `(gated)/jobs/`
    - `company-profile/` → `(gated)/company-profile/`
    - `companies/` → `(gated)/companies/`
  - Notes: Route groups are invisible in URLs — `/en/dashboard` stays `/en/dashboard`. Import paths use `@/` aliases, not relative paths, so they're unaffected by the directory move. Run `pnpm --filter @igbo/portal exec tsc --noEmit` after moves to verify no broken imports. Run `pnpm --filter @igbo/portal test` to verify all existing tests still pass at their new locations.

- [x] **Task 6: Create `(gated)/layout.tsx` with role gate**
  - File: `apps/portal/src/app/[locale]/(gated)/layout.tsx`
  - Action: Create server component layout:
    ```tsx
    import { setRequestLocale } from "next-intl/server";
    import { auth } from "@igbo/auth";
    import { redirect } from "next/navigation";
    import { PortalLayout } from "@/components/layout/portal-layout";

    export default async function GatedLayout({
      children,
      params,
    }: {
      children: React.ReactNode;
      params: Promise<{ locale: string }>;
    }) {
      const { locale } = await params;
      setRequestLocale(locale);

      const session = await auth();
      const portalRoles = ((session?.user as Record<string, unknown> | undefined)?.portalRoles ?? []) as string[];

      // Authenticated user with no portal roles → redirect to Choose Your Path
      if (session && portalRoles.length === 0) {
        redirect(`/${locale}/choose-role`);
      }

      // Unauthenticated (guest) or has roles → render normally
      return <PortalLayout>{children}</PortalLayout>;
    }
    ```
  - File: `apps/portal/src/app/[locale]/(gated)/layout.test.tsx`
  - Action: Create tests (mock `@igbo/auth` `auth()`, mock `next/navigation` `redirect`):
    1. "redirects authenticated user with no portal roles to /choose-role" — `auth()` returns `{ user: { id: "u1", portalRoles: [] } }` → assert `redirect` called with `/en/choose-role`
    2. "renders children for authenticated user with portal roles" — `auth()` returns `{ user: { id: "u1", portalRoles: ["EMPLOYER"], activePortalRole: "EMPLOYER" } }` → assert children rendered, `redirect` NOT called
    3. "renders children for unauthenticated user (guest browsing)" — `auth()` returns `null` → assert children rendered, `redirect` NOT called
    4. "redirect path includes correct locale" — `auth()` returns no-role session, `params: { locale: "ig" }` → assert `redirect` called with `/ig/choose-role`
  - Notes: Mock `PortalLayout` as passthrough `({ children }) => <div>{children}</div>` to isolate gate logic.

- [x] **Task 7: Create `POST /api/v1/portal/role/select` API route**
  - File: `apps/portal/src/app/api/v1/portal/role/select/route.ts`
  - Action: Create route handler:
    ```ts
    import "server-only";
    import { auth } from "@igbo/auth";
    import { withApiHandler } from "@/lib/api-middleware";
    import { ApiError } from "@/lib/api-error";
    import { successResponse } from "@/lib/api-response";
    import { getRoleByName, assignUserRole, getUserPortalRoles } from "@igbo/db/queries/auth-permissions";

    const SELF_SERVICE_ROLES = ["JOB_SEEKER", "EMPLOYER"] as const;
    type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

    export const POST = withApiHandler(async (req: Request): Promise<Response> => {
      // 1. Auth check
      const session = await auth();
      if (!session?.user) {
        throw new ApiError({ title: "Authentication required", status: 401 });
      }

      // 2. Parse + validate body
      let body: unknown;
      try { body = await req.json(); } catch {
        throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
      }
      const role = (body as { role?: string })?.role;
      if (!role || !SELF_SERVICE_ROLES.includes(role as SelfServiceRole)) {
        throw new ApiError({
          title: "Bad Request",
          status: 400,
          detail: `Invalid role. Must be one of: ${SELF_SERVICE_ROLES.join(", ")}`,
        });
      }

      // 3. Any-role 409 guard (first-time selection only)
      const existingRoles = await getUserPortalRoles(session.user.id);
      if (existingRoles.length > 0) {
        throw new ApiError({
          title: "Role already assigned",
          status: 409,
          detail: "You already have a portal role. Use role settings to manage roles.",
          extensions: { existingRoles },
        });
      }

      // 4. Look up role row
      const roleRow = await getRoleByName(role);
      if (!roleRow) {
        throw new ApiError({ title: "Internal Server Error", status: 500, detail: "Role not found in database" });
      }

      // 5. Assign role
      await assignUserRole(session.user.id, roleRow.id);

      // 6. Return assigned role for client-side session refresh
      return successResponse({ role, activePortalRole: role }, undefined, 201);
    });
    ```
  - File: `apps/portal/src/app/api/v1/portal/role/select/route.test.ts`
  - Action: Create tests (mock `@igbo/auth` `auth()`, mock `@igbo/db/queries/auth-permissions` functions):
    1. "assigns EMPLOYER role and returns 201" — happy path, `getUserPortalRoles` returns `[]`, `getRoleByName` returns role row, assert `assignUserRole` called, response has `{ data: { role: "EMPLOYER" } }`
    2. "assigns JOB_SEEKER role and returns 201" — same pattern for seeker
    3. "returns 409 when user already has any portal role" — `getUserPortalRoles` returns `["EMPLOYER"]` → assert 409 response with `existingRoles`
    4. "returns 409 on dual-tab race (different role requested)" — `getUserPortalRoles` returns `["JOB_SEEKER"]`, body `{ role: "EMPLOYER" }` → assert 409
    5. "returns 400 for invalid role name" — body `{ role: "INVALID" }` → assert 400
    6. "returns 400 for JOB_ADMIN (not self-service)" — body `{ role: "JOB_ADMIN" }` → assert 400
    7. "returns 401 for unauthenticated request" — `auth()` returns `null` → assert 401
  - Notes: Each test creates `new Request("http://localhost/api/v1/portal/role/select", { method: "POST", headers: { "Content-Type": "application/json", "Origin": "http://localhost", "Host": "localhost" }, body: JSON.stringify({ role }) })` and calls `POST(request)` directly.

- [x] **Task 8: Create `ChooseRoleForm` client component**
  - File: `apps/portal/src/components/choose-role/choose-role-form.tsx`
  - Action: Create `"use client"` component:
    - Props: `locale: string` (passed from server page for redirect paths)
    - Uses `useSession()` for `update()` and `useTranslations("Portal.chooseRole")`
    - Renders two Card components (Employer + Seeker), each with icon, title, description, CTA button
    - State: `selecting: "EMPLOYER" | "JOB_SEEKER" | null` (null = idle)
    - On card click: set `selecting` → fetch `POST /api/v1/portal/role/select` with `{ role }` → on success, call `update({ activePortalRole: role })` → `router.push(REDIRECT_MAP[role])`
    - Both cards disabled when `selecting !== null` (prevent double-selection)
    - Clicked card shows spinner (Loader2 icon from lucide-react)
    - `aria-live="polite"` region announces `t("selecting")` during loading
    - On error: reset `selecting` to null, show `toast.error(t("error"))`
    - Below cards: `<p>` with `t("addMoreLater")` reassurance text
    - Minimal header inline: OBIGBO logo + "Back to Community" link (matches portal-top-nav logo pattern)
    - Buttons are `<button type="button">` (not links — they trigger API call)
    - All text via `useTranslations` — no hardcoded strings
    - Focus-visible rings, min-h-[44px] tap targets (established portal a11y pattern)
    - Redirect map: `{ EMPLOYER: "/${locale}/onboarding", JOB_SEEKER: "/${locale}/jobs" }`
  - File: `apps/portal/src/components/choose-role/choose-role-form.test.tsx`
  - Action: Create tests (mock `next-auth/react`, `next-intl`, `next/navigation`, `sonner`):
    1. "renders employer and seeker cards with translated text" — assert both cards visible with correct CTA text
    2. "calls API with EMPLOYER role on employer card click" — mock fetch → assert `POST /api/v1/portal/role/select` called with `{ role: "EMPLOYER" }`
    3. "calls API with JOB_SEEKER role on seeker card click" — same for seeker
    4. "disables both cards and announces loading via aria-live during API call" — click one card → assert both buttons disabled + `aria-live="polite"` region contains `t("selecting")` text
    5. "re-enables cards and shows error toast on API failure" — mock fetch to reject → assert buttons re-enabled + `toast.error` called
    6. "calls session update and redirects on success" — mock fetch success → assert `update({ activePortalRole: "EMPLOYER" })` called → assert `router.push` called with `/en/onboarding`
    7. "axe-core accessibility" — render → `// @ts-ignore` + `expect(await axe(container)).toHaveNoViolations()`
  - Notes: Use `vi.fn()` for global `fetch` mock. Use `userEvent.setup()` for button clicks (not `fireEvent.click`).

- [x] **Task 9: Create `choose-role/page.tsx` server component**
  - File: `apps/portal/src/app/[locale]/(ungated)/choose-role/page.tsx`
  - Action: Create server component:
    ```tsx
    import { setRequestLocale, getTranslations } from "next-intl/server";
    import { redirect } from "next/navigation";
    import { auth } from "@igbo/auth";
    import { ChooseRoleForm } from "@/components/choose-role/choose-role-form";

    interface PageProps {
      params: Promise<{ locale: string }>;
    }

    export async function generateMetadata({ params }: PageProps) {
      const { locale } = await params;
      const t = await getTranslations({ locale, namespace: "Portal.chooseRole" });
      return { title: `${t("title")} — OBIGBO Job Portal` };
    }

    export default async function ChooseRolePage({ params }: PageProps) {
      const { locale } = await params;
      setRequestLocale(locale);

      const session = await auth();
      const portalRoles = ((session?.user as Record<string, unknown> | undefined)?.portalRoles ?? []) as string[];

      // Already has roles → redirect to home (prevents re-entry)
      if (session && portalRoles.length > 0) {
        redirect(`/${locale}`);
      }

      // Unauthenticated → redirect to community login with returnTo
      if (!session) {
        const communityUrl = process.env.COMMUNITY_URL ?? "http://localhost:3000"; // ci-allow-process-env
        const portalUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3001"; // ci-allow-process-env
        redirect(`${communityUrl}/login?returnTo=${encodeURIComponent(`${portalUrl}/${locale}/choose-role`)}`);
      }

      return <ChooseRoleForm locale={locale} />;
    }
    ```
  - File: `apps/portal/src/app/[locale]/(ungated)/choose-role/page.test.tsx`
  - Action: Create tests (mock `@igbo/auth`, `next/navigation`, `next-intl/server`, `ChooseRoleForm`):
    1. "redirects to /{locale} when user already has portal roles" — `auth()` returns `{ user: { portalRoles: ["EMPLOYER"] } }` → assert `redirect` called with `/en`
    2. "renders ChooseRoleForm when user has no portal roles" — `auth()` returns `{ user: { portalRoles: [] } }` → assert `ChooseRoleForm` rendered with `locale="en"`
    3. "redirects unauthenticated user to community login with returnTo" — `auth()` returns `null` → assert `redirect` called with community login URL containing `returnTo` param pointing back to `/choose-role`
  - Notes: Mock `ChooseRoleForm` as `({ locale }) => <div data-testid="choose-role-form" data-locale={locale} />` to isolate server logic.

- [x] **Task 10: Run full test suite and verify**
  - Action: Run `pnpm --filter @igbo/portal test` — all tests must pass including new and moved tests.
  - Action: Run `pnpm --filter @igbo/portal exec tsc --noEmit` — no TypeScript errors.
  - Action: Verify test count: expect ~23 new tests + 2 updated assertions. Previous baseline: 709 portal tests. Expected new baseline: ~732.
  - Notes: If any moved tests fail, check for relative import paths that broke during the move (unlikely since all use `@/` aliases).

### Acceptance Criteria

- [ ] **AC 1:** Given an authenticated user with no portal roles, when they navigate to any gated portal page (e.g., `/en/my-jobs`, `/en/jobs`, `/en`), then they are redirected to `/en/choose-role`.

- [ ] **AC 2:** Given an authenticated user with portal roles (e.g., `["EMPLOYER"]`), when they navigate to any gated portal page, then they see the page normally with PortalLayout (TopNav + BottomNav).

- [ ] **AC 3:** Given an unauthenticated user (guest), when they navigate to any gated portal page, then they see the page normally with guest nav links (no redirect to `/choose-role`).

- [ ] **AC 4:** Given an authenticated user with no portal roles, when they land on the Choose Your Path page, then they see two cards: "Employer" and "Job Seeker" with translated titles, descriptions, and CTAs.

- [ ] **AC 5:** Given an authenticated user on the Choose Your Path page, when they click "Get Started as Employer", then: the API assigns the `EMPLOYER` role, the session refreshes with `activePortalRole: "EMPLOYER"`, and they are redirected to `/{locale}/onboarding`.

- [ ] **AC 6:** Given an authenticated user on the Choose Your Path page, when they click "Get Started as Seeker", then: the API assigns the `JOB_SEEKER` role, the session refreshes with `activePortalRole: "JOB_SEEKER"`, and they are redirected to `/{locale}/jobs`.

- [ ] **AC 7:** Given a user who already has any portal role, when they `POST /api/v1/portal/role/select`, then the API returns 409 Conflict with `existingRoles` in the response body.

- [ ] **AC 8:** Given any user, when they `POST /api/v1/portal/role/select` with `{ role: "JOB_ADMIN" }`, then the API returns 400 Bad Request.

- [ ] **AC 9:** Given an unauthenticated request, when it hits `POST /api/v1/portal/role/select`, then the API returns 401.

- [ ] **AC 10:** Given a user who already has portal roles, when they navigate directly to `/choose-role`, then they are redirected to `/{locale}` (server-side guard).

- [ ] **AC 11:** Given an authenticated user with no portal roles, when `useActivePortalRole()` is called, then it returns `{ role: null, isSeeker: false, isEmployer: false, isAdmin: false, isAuthenticated: true, allRoles: [], hasMultipleRoles: false }`.

- [ ] **AC 12:** Given an authenticated user with `allRoles: []`, when the `RoleSwitcher` component renders, then it renders nothing (no badge, no dropdown).

- [ ] **AC 13:** Given a user clicks a role card, when the API call is in progress, then both cards are disabled, the clicked card shows a spinner, and an `aria-live` region announces the loading message.

- [ ] **AC 14:** Given a user clicks a role card and the API returns an error, when the error is received, then both cards re-enable, an error toast appears, and the user can try again.

- [ ] **AC 15:** Given the Choose Your Path page is rendered, when tested with axe-core, then it has no accessibility violations.

## Additional Context

### Dependencies

- `@igbo/db`: `getRoleByName`, `assignUserRole`, `getUserPortalRoles`, `getPlatformSetting` — all exist, no changes needed
- `@igbo/auth`: JWT callback `trigger === "update"` path — exists, handles `activePortalRole` refresh
- `packages/auth/src/portal-role.ts`: `PortalRole` type — exists
- No new migrations required (roles already seeded in migration 0050)
- No new DB tables
- shadcn/ui components needed: Card, Button — already installed in portal
- lucide-react icons: BriefcaseIcon, SearchIcon, Loader2 — already available

### i18n Key Inventory

| Key | English | Purpose |
| --- | ------- | ------- |
| `Portal.chooseRole.title` | "Choose Your Path" | Page heading |
| `Portal.chooseRole.subtitle` | "How would you like to use the OBIGBO Job Portal?" | Subheading |
| `Portal.chooseRole.employer.title` | "Employer" | Employer card title |
| `Portal.chooseRole.employer.description` | "Post jobs and find talent from the Igbo community." | Employer card body |
| `Portal.chooseRole.employer.cta` | "Get Started as Employer" | Employer card button |
| `Portal.chooseRole.seeker.title` | "Job Seeker" | Seeker card title |
| `Portal.chooseRole.seeker.description` | "Discover opportunities and connect with Igbo businesses." | Seeker card body |
| `Portal.chooseRole.seeker.cta` | "Get Started as Seeker" | Seeker card button |
| `Portal.chooseRole.addMoreLater` | "You can add more roles later from your portal settings." | Reassurance note |
| `Portal.chooseRole.error` | "Something went wrong. Please try again." | Error toast |
| `Portal.chooseRole.selecting` | "Setting up your account..." | Loading state |

### Testing Strategy

**New tests (~23):**

| Area | Count | Risk | Tests |
| ---- | ----- | ---- | ----- |
| `(gated)/layout.tsx` gate | 4 | HIGH | no-role→redirect, has-role→passthrough, unauthenticated→no redirect, locale in redirect path |
| `choose-role/page.tsx` (server) | 3 | HIGH | already-has-role→redirect, no-role→renders form, unauthenticated→renders form |
| `POST /api/v1/portal/role/select` | 7 | HIGH | assign employer, assign seeker, 409 any-role, 409 dual-tab race, 400 invalid, 400 JOB_ADMIN, 401 unauthed |
| `ChooseRoleForm` (client) | 7 | HIGH | renders cards, employer click→API, seeker click→API, both disable during loading, error recovery, session update+redirect, axe-core a11y |
| `useActivePortalRole` fix | 1 | MED | new "authenticated no-role → null" test |
| `RoleSwitcher` guard | 1 | LOW | authenticated + empty allRoles → renders nothing |

**Updated tests: 2** (use-active-portal-role.test.ts assertion flip + edge case)

**Expected new baseline:** ~732 portal tests (709 + ~23 new)

### Validation Scenarios (SN-2)

1. **New community member → Employer path:** Authenticated user with no portal roles → redirected to `/choose-role` → selects Employer → API assigns role → session refreshes → redirected to `/onboarding` → completes onboarding. No DB intervention required.
2. **New community member → Seeker path:** Same flow → selects Seeker → redirected to `/jobs`.
3. **Re-entry prevention:** User with existing role navigates directly to `/choose-role` → server guard redirects to `/{locale}`.
4. **Guest browsing unaffected:** Unauthenticated user browses `/jobs` → sees guestLinks nav → no redirect to `/choose-role`.
5. **Hook fix regression check:** Existing portal pages render correctly for users with explicit `JOB_SEEKER`, `EMPLOYER`, `JOB_ADMIN` roles. No behavior change for users who already have roles.

### Post-Selection Redirect Map

| Selected Role | Redirect Target |
| ------------- | --------------- |
| `EMPLOYER` | `/{locale}/onboarding` |
| `JOB_SEEKER` | `/{locale}/jobs` |

### Success Criteria

1. Community member can self-service into employer role and enter onboarding without DB intervention
2. Community member can self-service into seeker role
3. No-role users cannot access any portal page except `/choose-role`
4. Users who already have a portal role are redirected away from Choose Your Path page
5. `useActivePortalRole` returns `role: null` when user has no portal roles (no silent fallback)
6. Guest (unauthenticated) browsing is unaffected — no redirects to `/choose-role`

### Notes

- References: Portal Epic 1 Retro PREP-D (`portal-epic-1-retro-2026-04-05.md`)
- Blocks P-2.1 (Seeker Profile)
- Next migration: 0056 (but this spec needs none)
- UX: Choose Your Path is a focused decision screen with minimal chrome (logo + back-to-community only, no full nav)
- Accessibility: Cards are `<button>` elements, keyboard navigable, focus-visible ring, aria-labels, `aria-live="polite"` loading announcement, axe-core assertions in tests
- UX loading behavior: On card click, BOTH cards disable immediately. Clicked card shows spinner. `aria-live` region announces `selecting` message. On error, both cards re-enable and error toast appears.
- Component split: `choose-role/page.tsx` (server) handles auth guard + redirect. `ChooseRoleForm` (client) handles interactive role selection. Matches `onboarding/page.tsx` pattern.
- Auth in API route: Inline `auth()` check — no new permission helper needed. `getUserPortalRoles()` for the any-role 409 guard.
- Read-after-write consistency: Assumed single Postgres instance with synchronous commit. JWT callback reads role immediately after route handler writes it.
- `platformSettings` key `portal_employer_auto_approve`: The decision to use this key as the gating mechanism for future admin control is documented here. The actual `getPlatformSetting()` read is **deferred** to the story that adds the admin toggle + approval workflow + client 202 handling. Reading it now but never acting on `false` would be dead code. The route in this spec always auto-approves. Add `// TODO: check portal_employer_auto_approve when admin toggle is implemented` comment in route.
