# Story P-0.4: Portal App Scaffold & Navigation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a community member visiting the job portal,
I want a functional portal app with navigation back to the community and my portal role reflected in the UI,
so that I can orient myself and begin using portal features in the correct context (seeker or employer).

## Acceptance Criteria

1. **AC1 — Next.js App Setup:** Given the portal app scaffold at `apps/portal/` exists as a minimal shell, When the full scaffold is implemented, Then it is a Next.js 16.1.x App Router application with TypeScript strict mode And it imports `@igbo/config`, `@igbo/db`, and `@igbo/auth` from the monorepo And it uses next-intl with a `Portal.*` i18n namespace (messages in `apps/portal/messages/en.json` and `apps/portal/messages/ig.json`) And shadcn/ui is initialized with the portal's design tokens (copied from community, not shared via @igbo/ui).

2. **AC2 — Role-Aware Layout:** Given a user is authenticated via SSO and has portal roles, When they visit the portal, Then their `activePortalRole` is injected into the session context (defaulting to JOB_SEEKER if they have both roles) And the portal layout reflects the active role (seeker vs employer navigation items) And a role indicator is visible in the UI (to be expanded into a full role switcher in Epic 1).

3. **AC3 — Bidirectional Navigation (PRD FR114):** Given a user is on the portal, When they look at the navigation, Then a clearly visible link/button navigates back to the community platform And the community platform has a corresponding link to the portal (PRD FR114 — bidirectional navigation).

4. **AC4 — Guest / Unauthenticated Access:** Given a guest (unauthenticated) user visits the portal, When the portal loads, Then they see public portal pages (placeholder for Epic 4's guest access) And protected routes redirect to the community login page with a `returnTo` parameter pointing back to the portal.

5. **AC5 — Dev Environment:** Given the portal app scaffold is complete, When `pnpm dev` is run from the monorepo root, Then both community (localhost:3000) and portal (localhost:3001) start successfully And hot module reload works independently for each app.

## Validation Scenarios (SN-2 — REQUIRED)

1. **Authenticated seeker sees seeker navigation** — Log in on community as a user with JOB_SEEKER portal role, navigate to portal (localhost:3001). Verify seeker nav items are displayed (Jobs for You, Browse, Apprenticeships, My Applications, Saved Jobs) and role indicator shows "Job Seeker".
   - Expected outcome: Seeker-oriented navigation renders; role indicator is visible
   - Evidence required: Screenshot of portal with seeker navigation and role indicator

2. **Authenticated employer sees employer navigation** — Log in as a user with EMPLOYER portal role (or switch role if dual-role). Verify employer nav items are displayed (Dashboard, My Jobs, Applications, Messages, Company Profile) and role indicator shows "Employer".
   - Expected outcome: Employer-oriented navigation renders; role indicator is visible
   - Evidence required: Screenshot of portal with employer navigation and role indicator

3. **Bidirectional navigation works** — From portal, click "Back to Community" link → arrives at community app. From community, click "Job Portal" link → arrives at portal. Both directions maintain authenticated session.
   - Expected outcome: Seamless navigation between apps, session preserved both ways
   - Evidence required: Screenshots showing navigation links and authenticated state on both apps

4. **Guest sees public layout with login prompt** — Open portal in incognito/unauthenticated browser. Verify public homepage renders. Attempt to visit a protected route → redirected to community login with `returnTo` param.
   - Expected outcome: Guest homepage loads; protected routes redirect to community login with correct returnTo
   - Evidence required: Screenshot of guest homepage + network tab showing redirect with returnTo param

5. **Both apps start with `pnpm dev`** — Run `pnpm dev` from monorepo root. Verify community on :3000 and portal on :3001 both render. Change a portal component → HMR updates without affecting community.
   - Expected outcome: Both apps running, independent HMR
   - Evidence required: Terminal output showing both apps started; browser showing both apps

6. **i18n language toggle works** — Switch portal language from English to Igbo. Verify all Portal.* namespace strings render in Igbo.
   - Expected outcome: Portal navigation and UI text renders in Igbo
   - Evidence required: Screenshot of portal in Igbo locale

## Flow Owner (SN-4)

**Owner:** Dev (manual testing of navigation, layout rendering, i18n, and cross-app SSO continuity)

## Tasks / Subtasks

### Task 1: Tailwind CSS v4 + PostCSS + Portal Design Tokens (AC: #1)

Set up Tailwind v4 (CSS-first config, matching community pattern) with portal-specific color tokens.

- [ ] 1.1 Add Tailwind CSS dependencies to `apps/portal/package.json`
  - `tailwindcss` (v4), `@tailwindcss/postcss`, `@tailwindcss/typography`, `postcss`
  - Match community versions from root/community package.json
- [ ] 1.2 Create `apps/portal/postcss.config.mjs`
  - Same pattern as community: `export default { plugins: { "@tailwindcss/postcss": {} } }`
- [ ] 1.3 Create `apps/portal/src/app/globals.css`
  - `@import "tailwindcss"` at top
  - `@theme inline { ... }` block with portal design tokens
  - **Portal color tokens** (from architecture + UX spec):
    - `--primary`: Forest Green `oklch(0.422 0.093 141)` (identity/trust — same as community)
    - `--primary-foreground`: `oklch(1 0 0)` (white)
    - `--secondary`: Warm Sandy Tan `oklch(0.726 0.08 65)` (warmth/community)
    - `--secondary-foreground`: `oklch(0.216 0.044 45)` (dark brown)
    - `--accent`: Golden Amber `oklch(0.646 0.118 75)` (action/energy — CTAs)
    - `--accent-foreground`: `oklch(0.216 0.044 45)`
    - Portal-specific additions:
      - `--portal-context`: Teal-shift `oklch(0.45 0.09 160)` (active states, match quality)
      - `--portal-action`: Golden Amber `oklch(0.646 0.118 75)` (Apply, Post Job buttons)
    - Copy ALL remaining tokens from community `globals.css` (background, foreground, muted, border, destructive, success, warning, info, card, popover, sidebar, chart colors, radius, dark mode)
  - Copy community font-face / font-variable definitions (Inter, JetBrains Mono)
  - Copy high-contrast `[data-contrast="high"]` variant
- [ ] 1.4 Import `globals.css` in `apps/portal/src/app/layout.tsx`

### Task 2: shadcn/ui Initialization (AC: #1)

Copy shadcn/ui primitives from community into portal. Per architecture: portal copies components, does NOT share via @igbo/ui.

- [ ] 2.1 Create `apps/portal/components.json` (shadcn config)
  - `style: "new-york"`, `rsc: true`, `tsx: true`
  - `aliases`: `components: "@/components"`, `utils: "@/lib/utils"`, `ui: "@/components/ui"`, `hooks: "@/hooks"`
  - `css: "src/app/globals.css"`, `baseColor: "stone"`, `cssVariables: true`, `iconLibrary: "lucide"`
- [ ] 2.2 Create `apps/portal/src/lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
  - Copy from community: `import { clsx, type ClassValue } from "clsx"; import { twMerge } from "tailwind-merge"; export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }`
- [ ] 2.3 Add required dependencies to `apps/portal/package.json`
  - `clsx`, `tailwind-merge`, `lucide-react`, `class-variance-authority` (cva)
  - `@radix-ui/react-slot`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-avatar`, `@radix-ui/react-tooltip`, `@radix-ui/react-separator`
  - `next-themes` (for potential dark mode)
- [ ] 2.4 Copy essential shadcn/ui components from `apps/community/src/components/ui/` to `apps/portal/src/components/ui/`
  - **Required for this story**: `button.tsx`, `avatar.tsx`, `dropdown-menu.tsx`, `navigation-menu.tsx`, `separator.tsx`, `tooltip.tsx`, `sheet.tsx` (for mobile menu), `badge.tsx`
  - Update imports in copied files: ensure they use `@/lib/utils` (portal-local path)
  - Do NOT copy all 40+ community UI components — only what's needed now. More can be added in future stories.

### Task 3: next-intl Setup + Portal i18n Namespace (AC: #1)

Wire up next-intl for the portal with `Portal.*` message namespace.

- [ ] 3.1 Add `next-intl` dependency to `apps/portal/package.json`
  - Same version as community (`^4.8.3`)
- [ ] 3.2 Create `apps/portal/src/i18n/routing.ts`
  - Same pattern as community: `defineRouting({ locales: ["en", "ig"], defaultLocale: "en", localeCookie: { maxAge: 60 * 60 * 24 * 365 } })`
- [ ] 3.3 Create `apps/portal/src/i18n/request.ts`
  - `getRequestConfig` that imports from `../../messages/${locale}.json`
- [ ] 3.4 Create `apps/portal/src/i18n/navigation.ts`
  - `createNavigation(routing)` — export `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname`
- [ ] 3.5 Update `apps/portal/next.config.ts`
  - Add `createNextIntlPlugin` from `next-intl/plugin` wrapping the config
  - Point to `./src/i18n/request.ts`
- [ ] 3.6 Create `apps/portal/messages/en.json` with Portal namespace
  ```json
  {
    "Portal": {
      "nav": {
        "home": "Home",
        "jobs": "Jobs for You",
        "browseAll": "Browse All Jobs",
        "apprenticeships": "Apprenticeships",
        "myApplications": "My Applications",
        "savedJobs": "Saved Jobs",
        "dashboard": "Dashboard",
        "myJobs": "My Jobs",
        "applications": "Applications",
        "messages": "Messages",
        "companyProfile": "Company Profile",
        "backToCommunity": "Back to Community",
        "postJob": "Post a Job",
        "login": "Log In",
        "joinNow": "Join Now"
      },
      "role": {
        "seeker": "Job Seeker",
        "employer": "Employer",
        "admin": "Job Admin",
        "switchRole": "Switch Role"
      },
      "home": {
        "title": "OBIGBO Job Portal",
        "subtitle": "Connecting the Igbo diaspora with opportunities",
        "guestWelcome": "Browse job opportunities from employers in the Igbo community",
        "seekerWelcome": "Welcome back! Find your next opportunity",
        "employerWelcome": "Welcome back! Manage your job postings"
      },
      "guest": {
        "loginPrompt": "Log in to apply for jobs",
        "joinPrompt": "Join the community to get started"
      },
      "meta": {
        "title": "OBIGBO Job Portal",
        "description": "Job opportunities for the Igbo diaspora community"
      }
    },
    "Shell": {
      "skipToContent": "Skip to main content"
    }
  }
  ```
- [ ] 3.7 Create `apps/portal/messages/ig.json` with Igbo translations
  ```json
  {
    "Portal": {
      "nav": {
        "home": "Ụlọ",
        "jobs": "Ọrụ Maka Gị",
        "browseAll": "Lelee Ọrụ Niile",
        "apprenticeships": "Ọzụzụ Ọrụ",
        "myApplications": "Ngwa M",
        "savedJobs": "Ọrụ Ndị Echekwara",
        "dashboard": "Dashibọọdụ",
        "myJobs": "Ọrụ M",
        "applications": "Ngwa",
        "messages": "Ozi",
        "companyProfile": "Profaịlụ Ụlọ Ọrụ",
        "backToCommunity": "Laghachi na Obodo",
        "postJob": "Tinye Ọrụ",
        "login": "Banye",
        "joinNow": "Sonye Ugbu a"
      },
      "role": {
        "seeker": "Onye Na-achọ Ọrụ",
        "employer": "Onye Ọrụ Na-enye",
        "admin": "Onye Nlekọta Ọrụ",
        "switchRole": "Gbanwee Ọrụ"
      },
      "home": {
        "title": "Ụlọ Ọrụ OBIGBO",
        "subtitle": "Jikọọ ndị Igbo nọ n'ụwa niile na ohere ọrụ",
        "guestWelcome": "Lelee ohere ọrụ sitere n'aka ndị ọrụ na-enye na obodo Igbo",
        "seekerWelcome": "Nnọọ! Chọta ohere gị na-esote",
        "employerWelcome": "Nnọọ! Jikwaa ọrụ ndị ị tinyere"
      },
      "guest": {
        "loginPrompt": "Banye iji tinye akwụkwọ maka ọrụ",
        "joinPrompt": "Sonye obodo ka ịmalite"
      },
      "meta": {
        "title": "Ụlọ Ọrụ OBIGBO",
        "description": "Ohere ọrụ maka ndị Igbo nọ n'ụwa niile"
      }
    },
    "Shell": {
      "skipToContent": "Wụga na nnọọ isi"
    }
  }
  ```

### Task 4: Portal Layout + Font Setup + Providers (AC: #1, #2)

Create the root layout with fonts, CSS, SessionProvider, and the `[locale]` layout with next-intl.

- [ ] 4.1 Update `apps/portal/src/app/layout.tsx` (root layout)
  - Import `globals.css`
  - Import Inter + JetBrains Mono from `next/font/google` (same as community)
  - Apply font variables to `<html>` tag: `className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}`
  - Set `lang="en"` as default (next-intl will override per locale)
  - Keep existing metadata (title, description)
- [ ] 4.2 Create `apps/portal/src/app/[locale]/layout.tsx` (locale layout)
  - Follow community pattern exactly:
    - `generateStaticParams()` returning locales
    - `hasLocale()` check → `notFound()` if invalid
    - `setRequestLocale(locale)` for static rendering
    - `const session = await auth()` from `@igbo/auth`
    - Wrap children in `<SessionProvider session={session}>` + `<NextIntlClientProvider>`
    - Add `<SkipLink>` using `useTranslations("Shell")`
  - Wrap in `<PortalLayout>` component (created in Task 5)
- [ ] 4.3 Create `apps/portal/src/app/[locale]/page.tsx` (portal homepage)
  - Server Component with `setRequestLocale(locale)`
  - Use `auth()` to check session
  - If authenticated: render welcome message based on `activePortalRole` (seeker vs employer)
  - If guest: render guest welcome with login/join CTAs linking to community login with `returnTo`
  - Use `useTranslations("Portal.home")` for all strings
  - This is a placeholder — real homepage built in Epic 4
- [ ] 4.4 Create redirect from root `apps/portal/src/app/page.tsx`
  - `redirect("/en")` — redirect root to default locale (same pattern as community if applicable, or use next-intl middleware for locale detection)

### Task 5: Portal Navigation Components (AC: #2, #3)

Create the portal layout shell with role-aware navigation.

- [ ] 5.1 Create `apps/portal/src/components/layout/portal-layout.tsx`
  - Client Component (`"use client"`)
  - Renders `<PortalTopNav>` + `<main id="main-content">` + `<PortalBottomNav>`
  - Reads session via `useSession()` from `next-auth/react`
  - Passes `activePortalRole` from session to nav components
- [ ] 5.2 Create `apps/portal/src/components/layout/portal-top-nav.tsx`
  - Client Component
  - **Desktop (lg+):** Logo (link to portal home) + horizontal nav links (role-dependent) + "Back to Community" link + role indicator badge + user avatar dropdown
  - **Mobile (<lg):** Logo + hamburger menu (Sheet) + avatar
  - **Seeker nav items:** Jobs for You, Browse All, Apprenticeships, My Applications, Saved Jobs
  - **Employer nav items:** Dashboard, My Jobs, Applications, Messages, Company Profile + "Post a Job" CTA button (Golden Amber accent)
  - **Guest nav items:** Browse Jobs, Apprenticeships + Login / Join Now buttons
  - **Role indicator:** `<Badge>` showing current role text (e.g., "Job Seeker" / "Employer") — placeholder for full role switcher in Epic 1
  - **"Back to Community" link:** Prominent, always visible. Links to `COMMUNITY_URL` env var (with `NEXT_PUBLIC_COMMUNITY_URL` for client-side). Uses community icon + text.
  - Uses `useTranslations("Portal.nav")` and `useTranslations("Portal.role")` for all strings
  - Sticky `top-0` with `z-50`, same height as community (`h-16`)
- [ ] 5.3 Create `apps/portal/src/components/layout/portal-bottom-nav.tsx`
  - Client Component
  - Mobile only (`md:hidden`, fixed bottom)
  - **Seeker tabs:** Home, Jobs, Applications, Messages, Profile
  - **Employer tabs:** Home, Dashboard, Messages, Profile
  - **Guest tabs:** Home, Jobs, Login
  - Active tab highlighted with `portal-context` teal color
  - Uses `useTranslations("Portal.nav")`
- [ ] 5.4 Create `apps/portal/src/hooks/use-active-portal-role.ts`
  - Custom hook that reads `activePortalRole` from `useSession()` session data
  - Returns `{ role: "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN" | null, isSeeker: boolean, isEmployer: boolean, isAdmin: boolean, isAuthenticated: boolean }`
  - Returns `null` role for unauthenticated users
  - Defaults to `JOB_SEEKER` if user has both roles (as per AC2)
- [ ] 5.5 Add `NEXT_PUBLIC_COMMUNITY_URL` env var
  - Add to `apps/portal/.env.local.example`: `NEXT_PUBLIC_COMMUNITY_URL=http://localhost:3000`
  - This is the client-accessible URL for "Back to Community" links
  - Server-side `COMMUNITY_URL` already exists (from P-0.3C) for middleware redirects

### Task 6: Community → Portal Navigation Link (AC: #3)

Add a "Job Portal" link in the community platform's navigation.

- [ ] 6.1 Add i18n keys to community `apps/community/messages/en.json`
  - Under `Navigation`: add `"jobPortal": "Job Portal"`
  - Under `Navigation` in `apps/community/messages/ig.json`: add `"jobPortal": "Ụlọ Ọrụ"`
- [ ] 6.2 Update `apps/community/src/components/layout/TopNav.tsx`
  - Add a "Job Portal" link (external link using `<a>` tag, not next/link — different app)
  - Link to `process.env.NEXT_PUBLIC_PORTAL_URL` (new env var)
  - Position: in the main nav links section, after existing links
  - Include a small external-link icon (lucide `ExternalLink` or `Briefcase`)
  - Visible to authenticated members only (not guests — they discover portal via direct URL or marketing)
- [ ] 6.3 Add `NEXT_PUBLIC_PORTAL_URL` to community `.env.local` / `.env.local.example`
  - Default: `http://localhost:3001`
- [ ] 6.4 Add `NEXT_PUBLIC_PORTAL_URL` to `packages/config/src/env.ts` client schema
  - `NEXT_PUBLIC_PORTAL_URL: z.string().url().optional()` — optional so community works standalone without portal

### Task 7: Guest Route Protection + returnTo (AC: #4)

Ensure the portal middleware's existing auth gate redirects unauthenticated users to community login with `returnTo`.

- [ ] 7.1 Verify existing middleware behavior (from P-0.3B/P-0.3C)
  - The portal middleware already redirects unauthenticated users to community login. Verify the `returnTo` parameter is correctly set to the full portal URL the user was trying to access.
  - If the middleware uses a `/login` path without the community base URL, fix it to use `${COMMUNITY_BASE_URL}/login?returnTo=${encodeURIComponent(request.nextUrl.href)}`
- [ ] 7.2 Create a public route allowlist in middleware
  - Define paths that should be accessible without authentication: `/`, `/[locale]`, `/[locale]/jobs`, `/[locale]/jobs/[jobId]`, `/[locale]/apprenticeships`
  - For Phase 0, the homepage (`/[locale]` or `/[locale]/page`) should be public
  - All other routes require authentication
  - Update the middleware matcher or add path-based logic to skip auth for public paths
  - Pattern: check `pathname` against public route patterns before JWT validation
- [ ] 7.3 Update middleware tests for public route handling
  - Test: public paths (e.g., `/en`, `/en/jobs`) bypass auth and proceed
  - Test: protected paths (e.g., `/en/applications`) still require auth
  - Test: `returnTo` includes the full portal URL

### Task 8: Dev Environment Verification (AC: #5)

Ensure both apps run together smoothly.

- [ ] 8.1 Verify `pnpm dev` starts both apps
  - Community on port 3000, portal on port 3001
  - Both should be in the turbo `dev` pipeline already (from P-0.1)
  - If not, verify `apps/portal/package.json` has `"dev": "next dev -p 3001"` script
- [ ] 8.2 Verify HMR works independently
  - Change a portal component → only portal reloads
  - Change a community component → only community reloads
  - Change a shared package file → both apps reload
- [ ] 8.3 Update `apps/portal/.env.local.example` with all required env vars
  - Add any new env vars introduced in this story

### Task 9: Vitest Configuration + Test Utilities (AC: #1)

Set up portal test infrastructure for component testing.

- [ ] 9.1 Add test dependencies to `apps/portal/package.json`
  - `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
  - `jsdom` (already in vitest config as environment)
- [ ] 9.2 Create `apps/portal/src/test-utils/render.tsx`
  - `renderWithPortalProviders(ui, options?)` — wraps in `SessionProvider` + `NextIntlClientProvider`
  - Options: `{ session?: Session, locale?: string }`
  - Export `screen`, `waitFor`, `within` re-exports from testing-library
- [ ] 9.3 Update `apps/portal/vitest.config.ts` if needed
  - Ensure `@/` alias resolves correctly for all new files
  - Add `setupFiles` if needed for jest-dom matchers (`@testing-library/jest-dom/vitest`)

### Task 10: Component + Layout Tests (AC: #1, #2, #3, #4)

Write tests for all new components and layouts.

- [ ] 10.1 Create `apps/portal/src/components/layout/portal-top-nav.test.tsx`
  - Test: seeker role renders seeker nav items
  - Test: employer role renders employer nav items
  - Test: guest (no session) renders guest nav with login/join buttons
  - Test: "Back to Community" link is always visible and points to community URL
  - Test: role indicator badge shows correct role text
  - Test: mobile menu (Sheet) opens and contains nav items
- [ ] 10.2 Create `apps/portal/src/components/layout/portal-bottom-nav.test.tsx`
  - Test: seeker role renders seeker tabs (Home, Jobs, Applications, Messages, Profile)
  - Test: employer role renders employer tabs (Home, Dashboard, Messages, Profile)
  - Test: guest renders guest tabs (Home, Jobs, Login)
  - Test: active tab is highlighted based on current pathname
- [ ] 10.3 Create `apps/portal/src/components/layout/portal-layout.test.tsx`
  - Test: renders TopNav + main + BottomNav
  - Test: main element has id="main-content" for skip link
- [ ] 10.4 Create `apps/portal/src/hooks/use-active-portal-role.test.ts`
  - Test: returns JOB_SEEKER for seeker session
  - Test: returns EMPLOYER for employer session
  - Test: returns null for unauthenticated
  - Test: defaults to JOB_SEEKER when user has both roles
- [ ] 10.5 Create `apps/portal/src/app/[locale]/page.test.tsx`
  - Test: authenticated seeker sees seeker welcome message
  - Test: authenticated employer sees employer welcome message
  - Test: guest sees guest welcome with login/join CTAs
- [ ] 10.6 Update `apps/portal/src/middleware.test.ts`
  - Add tests for public route bypass (from Task 7)
  - Add tests for returnTo parameter correctness
- [ ] 10.7 Verify all existing portal tests still pass (middleware, auth route)

### Task 11: Community Portal Link Tests (AC: #3)

- [ ] 11.1 Update community TopNav tests (if they exist at `apps/community/src/components/layout/TopNav.test.tsx`)
  - Test: authenticated user sees "Job Portal" link
  - Test: "Job Portal" link href points to `NEXT_PUBLIC_PORTAL_URL`
  - Test: link is NOT visible to guests
  - If no TopNav tests exist, create minimal test for the portal link only

## Dev Notes

### Architecture Compliance

- **Separate Next.js app**: Portal is at `apps/portal/`, NOT a route group in community. Independent build, deploy, scaling.
- **Shared packages**: Import from `@igbo/config`, `@igbo/db`, `@igbo/auth` — never copy code from packages.
- **@igbo/ui deferred**: Per architecture decision, portal COPIES shadcn/ui primitives into its own `src/components/ui/`. Do NOT create an `@igbo/ui` shared package.
- **Portal tokens owned by portal**: `globals.css` color tokens are portal-specific. Shared base (spacing, fonts, breakpoints) from community pattern but NOT from a shared config package yet.
- **Tailwind v4 CSS-first**: No `tailwind.config.ts` file. Use `@theme inline { }` block in `globals.css` for all design tokens. This is the community pattern — follow it exactly.
- **No `apps/portal/src/env.ts`**: Per P-0.3C decision and architecture, portal has no env schema file. Middleware and server code read `process.env.*` directly. Only `NEXT_PUBLIC_*` vars are used client-side.
- **ActivePortalRole in session**: Already wired in `@igbo/auth` (P-0.3A/P-0.3B). JWT callback reads `getUserPortalRoles()` and sets `activePortalRole` in token. Session callback exposes it. The `use-active-portal-role` hook just reads from `useSession()`.

### Critical Patterns to Follow

- **`import "server-only"`** in all Server Components and server-side files
- **`"use client"`** directive in all Client Components
- **`useTranslations()`** for ALL user-facing strings — zero hardcoded strings
- **`@/` path alias** for portal-local imports, `@igbo/*` for shared packages
- **Component co-location**: Tests next to source files (e.g., `portal-top-nav.test.tsx` next to `portal-top-nav.tsx`)
- **shadcn/ui "new-york" style**: All copied UI components must use the new-york variant
- **Zod**: Import from `"zod/v4"` if needed (not bare `"zod"`)

### What Already Exists (from P-0.3A/B/C)

| File | State | Notes |
|------|-------|-------|
| `apps/portal/package.json` | EXISTS | Minimal deps — needs Tailwind, next-intl, shadcn deps |
| `apps/portal/next.config.ts` | EXISTS | Has `transpilePackages` — needs next-intl plugin wrapper |
| `apps/portal/vitest.config.ts` | EXISTS | Has aliases — may need testing-library setup |
| `apps/portal/src/middleware.ts` | EXISTS | Full JWT auth + ITP refresh — needs public route allowlist |
| `apps/portal/src/middleware.test.ts` | EXISTS | 25 tests — needs public route tests |
| `apps/portal/src/instrumentation.ts` | EXISTS | Redis init — no changes needed |
| `apps/portal/src/app/layout.tsx` | EXISTS | Minimal — needs fonts + CSS import |
| `apps/portal/src/app/page.tsx` | EXISTS | Placeholder — needs locale redirect |
| `apps/portal/src/app/api/auth/[...nextauth]/route.ts` | EXISTS | Complete — no changes needed |

### What Does NOT Exist Yet (Must Create)

- `postcss.config.mjs`
- `globals.css` (with portal design tokens)
- `components.json` (shadcn)
- `src/lib/utils.ts` (cn utility)
- `src/components/ui/` (copied shadcn primitives)
- `src/components/layout/` (portal-top-nav, portal-bottom-nav, portal-layout)
- `src/hooks/use-active-portal-role.ts`
- `src/i18n/` (routing, request, navigation)
- `messages/en.json`, `messages/ig.json`
- `src/app/[locale]/layout.tsx` (locale layout with providers)
- `src/app/[locale]/page.tsx` (portal homepage)
- `src/test-utils/render.tsx`

### Key Dependencies and Versions

| Package | Version | Source |
|---------|---------|--------|
| `next` | 16.1.6 | Already in portal |
| `next-intl` | ^4.8.3 | Match community |
| `tailwindcss` | v4 (latest) | Match community |
| `@tailwindcss/postcss` | Match community | PostCSS plugin |
| `@testing-library/react` | ^16.3.2 | Match community |
| `@testing-library/jest-dom` | ^6.9.1 | Match community |
| `lucide-react` | Match community | Icons |
| `clsx` | Match community | Class merging |
| `tailwind-merge` | Match community | Tailwind dedup |

### Community TopNav Modification Guidance

The community `TopNav.tsx` at `apps/community/src/components/layout/TopNav.tsx` is a complex Client Component with both desktop and mobile navigation. When adding the portal link:
- Add it to the **desktop nav links section** (where Feed, Articles, Chat, etc. are listed)
- Add it to the **mobile nav panel** (the slide-down hamburger menu)
- Use `<a href={portalUrl}>` (external link, not next/link) with `target="_self"` (same tab — SSO should carry over)
- Guard behind `session` check — only show to authenticated users
- Use `Briefcase` icon from lucide-react for visual consistency

### Integration Tests (SN-3 — Missing Middle)

- Portal layout renders correctly with real SessionProvider + NextIntlClientProvider (not just mocked)
- Portal navigation role switching reflects correct nav items
- Bidirectional navigation: community link leads to portal, portal link leads to community
- Guest route protection redirects correctly with full returnTo URL
- i18n locale switching renders correct translations

### Project Structure Notes

New files follow the portal component architecture from the architecture document:
```
apps/portal/src/
├── app/
│   ├── globals.css                    # Portal design tokens (Tailwind v4)
│   ├── layout.tsx                     # Root layout (fonts + CSS)
│   ├── page.tsx                       # Root → locale redirect
│   └── [locale]/
│       ├── layout.tsx                 # SessionProvider + NextIntlClientProvider
│       └── page.tsx                   # Portal homepage (role-aware)
├── components/
│   ├── ui/                            # Copied shadcn/ui primitives
│   │   ├── button.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── sheet.tsx
│   │   ├── separator.tsx
│   │   ├── tooltip.tsx
│   │   └── navigation-menu.tsx
│   └── layout/
│       ├── portal-layout.tsx
│       ├── portal-layout.test.tsx
│       ├── portal-top-nav.tsx
│       ├── portal-top-nav.test.tsx
│       ├── portal-bottom-nav.tsx
│       └── portal-bottom-nav.test.tsx
├── hooks/
│   ├── use-active-portal-role.ts
│   └── use-active-portal-role.test.ts
├── i18n/
│   ├── routing.ts
│   ├── request.ts
│   └── navigation.ts
├── lib/
│   └── utils.ts
├── test-utils/
│   └── render.tsx
├── messages/              # (actually at apps/portal/messages/)
└── ...existing files...
```

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story P-0.4 AC1-AC5]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — Portal App Architecture, Portal Layout Components, Three-Layer Component Architecture]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — Monorepo Structure, Cross-Package Import Convention]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — Portal Tailwind color tokens, Design Token Strategy]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — Portal i18n Config, Portal.* namespace]
- [Source: `_bmad-output/planning-artifacts/prd-v2.md` — FR110 (dual-role), FR111 (activePortalRole), FR112 (role switcher), FR113 (portal roles), FR114 (bidirectional navigation)]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — Role-Based Navigation table, Portal Color Tokens, Guest Conversion Gate, Density Modes]
- [Source: `_bmad-output/implementation-artifacts/p-0-3c-safari-itp-compatibility.md` — Previous story learnings, middleware patterns, no portal env.ts decision]
- [Source: `_bmad-output/project-context.md` — Technology Stack & Versions, Critical Implementation Rules]

## Definition of Done (SN-1)

- [ ] All acceptance criteria met (AC1–AC5)
- [ ] All validation scenarios demonstrated with evidence
- [ ] Unit tests written and passing (layout, nav, hook, page, middleware public routes)
- [ ] Integration tests written and passing (SN-3) — providers rendering, role-aware nav, i18n switching
- [ ] Flow owner has verified the complete end-to-end chain (navigation between apps, role display, guest protection)
- [ ] No pre-existing test regressions introduced
- [ ] Both apps start with `pnpm dev` and HMR works independently
- [ ] Community TopNav shows "Job Portal" link for authenticated users

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Validation Evidence

<!-- Attach or link evidence for each validation scenario before moving to review -->

### Debug Log References

### Completion Notes List

### File List
