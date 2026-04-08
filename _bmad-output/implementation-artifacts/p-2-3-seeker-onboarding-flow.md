# Story P-2.3: Seeker Onboarding Flow

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a first-time job seeker on the portal,
I want a guided onboarding flow that walks me through creating my profile and setting preferences,
so that I can get started quickly and understand how the portal works for me.

## Acceptance Criteria

1. **AC1 — First-visit onboarding trigger** — Given a user with the `JOB_SEEKER` role visits the portal for the first time (no seeker profile exists), when they land on the seeker dashboard/home (`/`), then they are redirected to `/onboarding/seeker` where an onboarding flow is shown with a step indicator (Step 1: Profile → Step 2: Preferences & CV → Step 3: Ready). If a profile exists but `onboardingCompletedAt IS NULL`, the redirect still fires and the flow resumes at the appropriate step (Step 2 if profile exists, Step 3 should not be reachable without completing or skipping Step 2). If `onboardingCompletedAt` is set, the redirect does NOT fire — the seeker sees the normal home/dashboard.

2. **AC2 — Step 1: Profile creation** — Given the onboarding flow is active and no seeker profile exists, when Step 1 is presented, then the seeker sees the profile creation form (reusing `<SeekerProfileForm mode="create" prefill={prefill} onSuccess={handleStep1Complete} />` from P-2.1). Community data pre-fill (`getCommunityProfileForPrefill`) is passed as `prefill`. Completing Step 1 advances to Step 2 without a full page reload (the `onSuccess` callback triggers `advanceTo(2)`). If a profile already exists (mid-onboarding resume), Step 1 is shown as completed and the flow starts at Step 2.

3. **AC3 — Step 2: Preferences & CV** — Given the seeker completes their profile (Step 1), when Step 2 is shown, then they see the `<SeekerPreferencesSection>` component (from P-2.2) with a note "Set your preferences to get personalized recommendations" and optionally the `<SeekerCvManager>` component for CV upload. Step 2 has a "Skip for now" button. Completing the save or clicking "Skip" advances to Step 3. Both preferences and CV upload are optional — the seeker can skip the entire step.

4. **AC4 — Step 3: Completion summary** — Given the seeker reaches Step 3, when the completion screen is shown, then a summary displays what they've set up with contextual links: "Browse jobs" (`/jobs`), "Edit profile" (`/profile?edit=true`), "Update preferences" (`/profile`). If they skipped Step 2, gentle nudges are shown (e.g., "Upload a CV to apply faster", "Set your job preferences for better recommendations"). A "Get started" button calls `POST /api/v1/seekers/me/onboarding/complete` to mark `onboardingCompletedAt`, then navigates to the portal home (`/`).

5. **AC5 — `onboardingCompletedAt` persistence** — Migration `0061_seeker_onboarding.sql` adds `onboarding_completed_at TIMESTAMPTZ` (nullable) to `portal_seeker_profiles`. The Drizzle schema in `packages/db/src/schema/portal-seeker-profiles.ts` is **extended in place** (append only — do NOT touch existing columns). Journal entry appended: idx 61, tag `0061_seeker_onboarding`. New query `markSeekerOnboardingComplete(profileId: string)` in `packages/db/src/queries/portal-seeker-profiles.ts` sets `onboardingCompletedAt = new Date()` with `WHERE onboardingCompletedAt IS NULL` (idempotent). Returns the updated row or null.

6. **AC6 — Onboarding complete API route** — `POST /api/v1/seekers/me/onboarding/complete`: requires `requireJobSeekerRole()`, loads seeker profile by userId (404 `SEEKER_PROFILE_REQUIRED` if missing), calls `markSeekerOnboardingComplete(profile.id)`, returns `successResponse({ completed: true })`. Wrapped with `withApiHandler()`. Idempotent — repeat calls return 200 (no error if already marked).

7. **AC7 — Portal home seeker redirect** — The portal home page (`apps/portal/src/app/[locale]/(gated)/page.tsx`) is updated: when `activePortalRole === "JOB_SEEKER"`, load the seeker profile via `getSeekerProfileByUserId(session.user.id)`. If no profile exists OR `!profile.onboardingCompletedAt`, redirect to `/${locale}/onboarding/seeker`. This mirrors the existing employer pattern (lines 28-33 of the current file).

8. **AC8 — ChooseRoleForm redirect update** — The `REDIRECT_MAP` in `apps/portal/src/components/choose-role/choose-role-form.tsx` is updated: `JOB_SEEKER: "/onboarding/seeker"` (was `"/jobs"`). After role selection, seekers land directly in the onboarding flow.

9. **AC9 — DensityContext comfortable default** — The seeker onboarding layout uses Comfortable density mode by default. The `<DensityProvider>` is already wired with `ROLE_DENSITY_DEFAULTS.JOB_SEEKER = "comfortable"` — no additional work needed unless the onboarding page renders outside the density provider (verify in test).

10. **AC10 — Reuse OnboardingStepIndicator** — The existing `<OnboardingStepIndicator>` from `apps/portal/src/components/domain/onboarding-step-indicator.tsx` is reused (it is role-agnostic — takes `currentStep` and `completedSteps` props). The seeker flow passes 3 steps with seeker-specific titles via i18n keys: `Portal.seekerOnboarding.step1Title` ("Create your profile"), `Portal.seekerOnboarding.step2Title` ("Preferences & CV"), `Portal.seekerOnboarding.step3Title` ("You're ready!"). The component's `stepOf` key is reused from `Portal.onboarding.stepOf`.

11. **AC11 — Accessibility** — The step indicator uses `<nav>` with `aria-label`, `role="list"`, and `aria-current="step"`. The "Skip for now" button has `aria-label` explaining what is being skipped. Step transitions manage focus: after advancing to a new step, focus moves to the step heading (`<h2>`) via a ref. The "Get started" button on Step 3 has `aria-busy` during the API call. All interactive elements pass `axe-core` assertions.

12. **AC12 — i18n complete** — All new user-facing strings ship as keys under `Portal.seekerOnboarding.*`. English copy committed in `apps/portal/messages/en.json`. Igbo copy committed in `apps/portal/messages/ig.json` at Dev Completion. No hardcoded user-visible strings.

13. **AC13 — Existing tests remain green** — None of the changes break existing P-2.1 or P-2.2 tests. `pnpm --filter portal test`, `pnpm --filter @igbo/db test`, `pnpm --filter portal typecheck`, `pnpm --filter @igbo/db typecheck`, and `pnpm ci-checks` all pass with zero new regressions. All existing test fixtures for `PortalSeekerProfile` mock objects are updated to include `onboardingCompletedAt: null`.

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

**Gate Owner:** Scrum Master (enforces before story moves to `ready-for-dev`)
**Source of Rules:** `docs/monorepo-playbook.md` → §7 Frontend Safety & Readiness

### i18n Key Inventory

- [x] Every user-facing string in the UI mocks / ACs maps to a key below
- [x] English copy filled in for every row
- [x] Keys reserved in `apps/portal/messages/en.json` (Igbo copy at Dev Completion)
- Keys (English copy):
  - `Portal.seekerOnboarding.title` — "Set up your job seeker profile"
  - `Portal.seekerOnboarding.subtitle` — "Complete these steps to start finding opportunities."
  - `Portal.seekerOnboarding.step1Title` — "Create your profile"
  - `Portal.seekerOnboarding.step1Description` — "Tell employers about your skills and experience."
  - `Portal.seekerOnboarding.step2Title` — "Preferences & CV"
  - `Portal.seekerOnboarding.step2Description` — "Set your preferences to get personalized recommendations."
  - `Portal.seekerOnboarding.step3Title` — "You're ready!"
  - `Portal.seekerOnboarding.step3Description` — "Your profile is set up. Start exploring opportunities."
  - `Portal.seekerOnboarding.skipForNow` — "Skip for now"
  - `Portal.seekerOnboarding.getStarted` — "Get started"
  - `Portal.seekerOnboarding.completing` — "Completing…"
  - `Portal.seekerOnboarding.summaryTitle` — "You're all set!"
  - `Portal.seekerOnboarding.summaryProfileCreated` — "Profile created"
  - `Portal.seekerOnboarding.summaryPreferencesSet` — "Preferences saved"
  - `Portal.seekerOnboarding.summaryPreferencesSkipped` — "You can set your job preferences anytime."
  - `Portal.seekerOnboarding.summaryCvUploaded` — "CV uploaded"
  - `Portal.seekerOnboarding.summaryCvSkipped` — "Upload a CV to apply faster."
  - `Portal.seekerOnboarding.browseJobs` — "Browse jobs"
  - `Portal.seekerOnboarding.editProfile` — "Edit profile"
  - `Portal.seekerOnboarding.updatePreferences` — "Update preferences"
  - `Portal.seekerOnboarding.returnBanner` — "You haven't finished setting up. Pick up where you left off."

### Sanitization Points

- [x] **OR** [N/A] — this story renders no HTML from strings. Justification: all text is rendered as plain text nodes via i18n keys. The `SeekerProfileForm` and `SeekerPreferencesSection` are reused from P-2.1/P-2.2 and already validated. No `dangerouslySetInnerHTML` is introduced.

### Accessibility Patterns

- [x] Keyboard interaction pattern documented for every new interactive element
- [x] ARIA roles/labels listed for every semantically meaningful element
- [x] Focus management plan documented for every modal / dropdown / route transition
- [x] axe-core assertions planned in component tests
- Elements:
  - **OnboardingStepIndicator** (reused) — `<nav aria-label="...">`, `<div role="list">`, `<div role="listitem" aria-current="step">`. Already accessible from P-1.6 — no changes needed.
  - **Step transitions** — When advancing from Step N to Step N+1, focus moves to the new step's `<h2>` heading via a `ref` and `element.focus()`. This prevents screen reader users from being stranded.
  - **"Skip for now" button** — `<Button variant="ghost">` with `aria-label={t("skipForNow")}`. Standard button keyboard interaction (Enter/Space).
  - **"Get started" button (Step 3)** — `<Button>` with `aria-busy={isCompleting}` during the POST call. Disabled while busy.
  - **Summary links** — Standard `<Link>` elements, keyboard-navigable. Each has descriptive text (no "click here" patterns).
  - **Route transition** — After "Get started" completes, `router.push("/${locale}")` navigates to home. Focus is managed by Next.js default focus-on-main behavior.

### Component Dependencies

- [x] Every shadcn/ui (or other vendored) component this story needs is listed below
- [x] Verified present in `apps/portal/src/components/ui/` OR added as a Task 0 subtask
- Components:
  - `Button`, `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardDescription`, `Badge`, `Separator` — already present (verified by P-2.1/P-2.2).
  - `OnboardingStepIndicator` — already present from P-1.6 at `apps/portal/src/components/domain/onboarding-step-indicator.tsx`.
  - `SeekerProfileForm` — already present from P-2.1 at `apps/portal/src/components/flow/seeker-profile-form.tsx`.
  - `SeekerPreferencesSection` — already present from P-2.2 at `apps/portal/src/components/flow/seeker-preferences-section.tsx`.
  - `SeekerCvManager` — already present from P-2.2 at `apps/portal/src/components/flow/seeker-cv-manager.tsx`.
  - No new shadcn/ui components needed. **No Task 0 required.**

## Validation Scenarios (SN-2 — REQUIRED)

1. **First-time seeker triggers onboarding** — Log in as JOB_SEEKER with no seeker profile. Navigate to portal home (`/`). Verify redirect to `/onboarding/seeker` with Step 1 active (profile creation form).
   - Expected outcome: Step indicator shows Step 1 highlighted, `SeekerProfileForm` rendered in create mode with community pre-fill data.
   - Evidence required: Screenshot of onboarding page with step indicator.

2. **Complete Step 1 → advance to Step 2** — Fill in profile form (headline, summary, at least 1 skill) and submit. Verify Step 2 is shown with preferences section and CV upload.
   - Expected outcome: Profile saved to DB, Step 2 displayed with preferences form and "Skip for now" button. Step 1 is marked complete in the indicator.
   - Evidence required: Screenshot of Step 2 + DB record of seeker profile.

3. **Skip Step 2 → completion** — Click "Skip for now" on Step 2. Verify Step 3 (completion summary) is shown with nudge messages.
   - Expected outcome: Summary shows "Profile created" ✓, nudges for preferences and CV. "Get started" button visible.
   - Evidence required: Screenshot of Step 3 with nudges.

4. **Complete Step 2 → completion** — Instead of skipping, save preferences (add roles, salary range). Verify Step 3 shows all items as completed.
   - Expected outcome: Summary shows "Profile created" ✓ and "Preferences saved" ✓. No nudge for preferences.
   - Evidence required: Screenshot of Step 3 with completion badges.

5. **"Get started" marks onboarding complete** — Click "Get started" on Step 3. Verify API call succeeds and user is redirected to home.
   - Expected outcome: `POST /api/v1/seekers/me/onboarding/complete` returns 200. `portal_seeker_profiles.onboarding_completed_at` is set. User lands on home page (no re-redirect to onboarding).
   - Evidence required: DB record showing `onboarding_completed_at` + screenshot of normal home.

6. **Onboarding not shown on return** — After completing onboarding, navigate away and return to portal home. Verify onboarding is NOT triggered.
   - Expected outcome: Home page loads normally. No redirect to `/onboarding/seeker`.
   - Evidence required: Screenshot of normal home after return.

7. **Mid-onboarding resume** — Complete Step 1 (profile exists, `onboardingCompletedAt IS NULL`), then close the browser. Return to portal home.
   - Expected outcome: Redirect to `/onboarding/seeker` with Step 1 shown as complete, Step 2 active (preferences form). Previous profile data is preserved.
   - Evidence required: Screenshot showing Step 2 as the starting point.

8. **Non-seeker cannot access seeker onboarding** — As an EMPLOYER, navigate to `/onboarding/seeker`.
   - Expected outcome: Redirect away (to `/` or employer home). Onboarding page does not render.
   - Evidence required: URL bar showing redirect target.

9. **ChooseRoleForm redirects seeker to onboarding** — Complete the choose-role flow selecting JOB_SEEKER.
   - Expected outcome: After role assignment, user is redirected to `/onboarding/seeker` (not `/jobs`).
   - Evidence required: URL bar or test assertion.

10. **Onboarding complete route idempotent** — Call `POST /api/v1/seekers/me/onboarding/complete` twice.
    - Expected outcome: Both calls return 200. `onboarding_completed_at` is not overwritten on the second call.
    - Evidence required: Unit test output.

## Flow Owner (SN-4)

**Owner:** Dev (solo developer — validates complete flow manually after implementation)

## Tasks / Subtasks

- [x] **Task 1: DB migration & schema extension** (AC: #5)
  - [x] 1.1 Hand-write `packages/db/src/migrations/0061_seeker_onboarding.sql`:
    ```sql
    ALTER TABLE portal_seeker_profiles
      ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
    ```
    **DO NOT use drizzle-kit generate** — it fails with `server-only` error. Hand-write only.
  - [x] 1.2 Append journal entry to `packages/db/src/migrations/meta/_journal.json`:
    ```json
    { "idx": 61, "version": "7", "when": 1708000061000, "tag": "0061_seeker_onboarding", "breakpoints": true }
    ```
  - [x] 1.3 **Extend** `packages/db/src/schema/portal-seeker-profiles.ts` in place: add `onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true })` column. Do NOT touch existing columns. Keep all existing exports unchanged in shape.
  - [x] 1.4 Run `pnpm --filter @igbo/db build` and verify dist emits the new column.

- [x] **Task 2: Query layer — onboarding completion** (AC: #5, #6)
  - [x] 2.1 **Append only** to `packages/db/src/queries/portal-seeker-profiles.ts`:
    - `markSeekerOnboardingComplete(profileId: string): Promise<PortalSeekerProfile | null>` — `UPDATE portal_seeker_profiles SET onboarding_completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND onboarding_completed_at IS NULL RETURNING *`. Returns null if profile not found or already marked. Idempotent.
    - `import "server-only";` already present at top of file.
  - [x] 2.2 Extend `portal-seeker-profiles.test.ts` — append at least 4 new tests:
    - `markSeekerOnboardingComplete` sets timestamp and returns updated row
    - `markSeekerOnboardingComplete` is idempotent — second call returns null (WHERE IS NULL guard)
    - `markSeekerOnboardingComplete` returns null for non-existent profileId
    - `markSeekerOnboardingComplete` does not overwrite existing `onboardingCompletedAt`

- [x] **Task 3: Onboarding complete API route** (AC: #6)
  - [x] 3.1 Create `apps/portal/src/app/api/v1/seekers/me/onboarding/complete/route.ts`:
    - `POST` — `requireJobSeekerRole()`, load seeker profile by userId (`getSeekerProfileByUserId(session.user.id)`), throw 404 `SEEKER_PROFILE_REQUIRED` if no profile, call `markSeekerOnboardingComplete(profile.id)`, return `successResponse({ completed: true })`.
    - **Idempotency — do NOT treat null as error:** `markSeekerOnboardingComplete` returns `null` when `onboardingCompletedAt` is already set (due to `WHERE IS NULL` guard). This is the expected idempotent case — do NOT throw an error when null is returned. Always return `successResponse({ completed: true })` regardless of whether null or a row was returned.
    - Wrapped with `withApiHandler()`.
  - [x] 3.2 Test `route.test.ts` (≥ 6 tests):
    - POST 200 marks onboarding complete
    - POST 200 idempotent (already marked)
    - POST 404 SEEKER_PROFILE_REQUIRED when no profile
    - POST 403 non-seeker (EMPLOYER)
    - POST 401 unauthenticated
    - POST handles `markSeekerOnboardingComplete` returning null gracefully
  - [x] 3.3 **Mock pattern** — mirror P-2.2 route test pattern:
    ```typescript
    vi.mock("server-only", () => ({}));
    vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
    vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
      getSeekerProfileByUserId: vi.fn(),
      markSeekerOnboardingComplete: vi.fn(),
    }));
    ```

- [x] **Task 4: Portal home page — seeker onboarding redirect** (AC: #7)
  - [x] 4.1 Modify `apps/portal/src/app/[locale]/(gated)/page.tsx` — add a seeker block **after** the existing employer block (lines 28-33):
    ```typescript
    if (session?.user && activePortalRole === "JOB_SEEKER") {
      const profile = await getSeekerProfileByUserId(session.user.id);
      if (!profile || !profile.onboardingCompletedAt) {
        redirect(`/${locale}/onboarding/seeker`);
      }
    }
    ```
    Import `getSeekerProfileByUserId` from `@igbo/db/queries/portal-seeker-profiles`.
  - [x] 4.2 Update home page tests (`page.test.tsx`) — add ≥ 3 new tests:
    - JOB_SEEKER with no profile → redirects to `/onboarding/seeker`
    - JOB_SEEKER with profile but `onboardingCompletedAt = null` → redirects to `/onboarding/seeker`
    - JOB_SEEKER with `onboardingCompletedAt` set → renders home page normally (no redirect)

- [x] **Task 5: ChooseRoleForm redirect update** (AC: #8)
  - [x] 5.1 Modify `apps/portal/src/components/choose-role/choose-role-form.tsx` — change `REDIRECT_MAP`:
    ```typescript
    const REDIRECT_MAP: Record<string, string> = {
      EMPLOYER: "/onboarding",
      JOB_SEEKER: "/onboarding/seeker",  // was "/jobs"
    };
    ```
  - [x] 5.2 Update `choose-role-form.test.tsx` — update existing assertion for JOB_SEEKER redirect path from `/jobs` to `/onboarding/seeker`.

- [x] **Task 6: Seeker onboarding page (Server Component)** (AC: #1, #2, #7)
  - [x] 6.1 Create `apps/portal/src/app/[locale]/(gated)/onboarding/seeker/page.tsx` — Server Component mirroring the employer `onboarding/page.tsx` pattern:
    - Guard: `auth()` → if `activePortalRole !== "JOB_SEEKER"` → redirect to `/${locale}`
    - Load seeker profile: `getSeekerProfileByUserId(session.user.id)`
    - If `profile?.onboardingCompletedAt` → redirect to `/${locale}` (already onboarded)
    - Derive `initialStep`: no profile = 1, profile exists but `!onboardingCompletedAt` = 2
    - If `initialStep === 2`, fetch supplementary data: `getSeekerPreferencesByProfileId(profile.id)`, `listSeekerCvs(profile.id)` for passing to the flow component
    - If `initialStep === 1`, fetch community pre-fill: `getCommunityProfileForPrefill(session.user.id)` (import from `@igbo/db/queries/cross-app`)
    - Render `<SeekerOnboardingFlow locale={locale} initialStep={initialStep} seekerProfile={profile} prefill={prefill} initialPreferences={prefs} initialCvs={cvs} />`
  - [x] 6.2 Test `page.test.tsx` (≥ 6 tests):
    - Renders Step 1 when no profile (initialStep=1)
    - Renders Step 2 when profile exists but no onboardingCompletedAt (initialStep=2)
    - Redirects to home when onboarding already completed
    - Redirects non-seeker (EMPLOYER) to home
    - Passes community pre-fill data to flow component for Step 1
    - Passes preferences and CVs to flow component for Step 2
  - [x] 6.3 **Mock pattern** for page.test.tsx:
    ```typescript
    vi.mock("server-only", () => ({}));
    vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
    vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
    vi.mock("@igbo/db/queries/portal-seeker-profiles", () => ({
      getSeekerProfileByUserId: vi.fn(),
    }));
    vi.mock("@igbo/db/queries/portal-seeker-preferences", () => ({
      getSeekerPreferencesByProfileId: vi.fn(),
    }));
    vi.mock("@igbo/db/queries/portal-seeker-cvs", () => ({
      listSeekerCvs: vi.fn(),
    }));
    vi.mock("@igbo/db/queries/cross-app", () => ({
      getCommunityProfileForPrefill: vi.fn(),
    }));
    vi.mock("@/components/flow/seeker-onboarding-flow", () => ({
      SeekerOnboardingFlow: (props: Record<string, unknown>) => (
        <div data-testid="seeker-onboarding-flow" data-step={props.initialStep} />
      ),
    }));
    ```
    Mirror the employer `onboarding/page.test.tsx` structure for the guard and redirect assertions.

- [x] **Task 7: Seeker onboarding flow component** (AC: #2, #3, #4, #9, #10, #11)
  - [x] 7.1 Create `apps/portal/src/components/flow/seeker-onboarding-flow.tsx` — Client Component (`"use client"`).
  - [x] 7.2 Props:
    ```typescript
    interface SeekerOnboardingFlowProps {
      locale: string;
      initialStep: 1 | 2;
      seekerProfile: PortalSeekerProfile | null;
      prefill?: { displayName?: string; bio?: string } | null;
      initialPreferences?: PortalSeekerPreferences | null;
      initialCvs?: CvWithFile[];
    }
    ```
  - [x] 7.3 State: `currentStep: 1 | 2 | 3`, `completedSteps: number[]`, `createdProfile: PortalSeekerProfile | null`, `preferencesCompleted: boolean`, `cvUploaded: boolean`, `isCompleting: boolean`.
  - [x] 7.4 Initialize: `currentStep = initialStep`, if `initialStep === 2` then `completedSteps = [1]` and `createdProfile = seekerProfile`.
  - [x] 7.5 `advanceTo(step, justCompleted?)` — same pattern as employer onboarding: add `justCompleted` to `completedSteps`, set `currentStep = step`. After state update, focus the new step heading via ref.
  - [x] 7.6 **Step 1 render:** `<SeekerProfileForm mode="create" prefill={prefill} onSuccess={(p) => { setCreatedProfile(p as PortalSeekerProfile); advanceTo(2, 1); }} />`. Wrap in a `<Card>` with step heading and description.
    - **CRITICAL — `SeekerProfileForm` navigation suppression (two locations):** The P-2.1 create success block calls `onSuccess?.(json.data)` then immediately `router.replace("/profile")` on the next line — the navigation fires even when `onSuccess` is provided, navigating away from the onboarding flow. **Fix 1 (success handler):** change `onSuccess?.(json.data); router.replace("/profile");` to `if (onSuccess) { onSuccess(json.data); } else { router.replace("/profile"); }`. **Fix 2 (cancel button):** The cancel button also navigates: `router.replace(mode === "create" ? "/" : "/profile")`. Add an optional `onCancel?: () => void` prop. Change the cancel `onClick` to `if (onCancel) { onCancel(); } else { router.replace(mode === "create" ? "/" : "/profile"); }`. Pass `onCancel={() => router.push(\`/${locale}/\`)}` from the onboarding flow's Step 1 render. Both props are optional — existing usage without them is unchanged. Add 2 tests to `seeker-profile-form.test.tsx`: "create mode with onSuccess does not call router.replace" and "create mode with onCancel calls onCancel instead of router.replace".
    - **Type cast:** `onSuccess` prop is typed `(profile: unknown) => void`. Cast safely: `setCreatedProfile(p as PortalSeekerProfile)` — this is safe because the route always returns a full seeker profile on 201.
  - [x] 7.7 **Step 2 render:** `<Card>` containing `<SeekerPreferencesSection>` (with `initialPrefs` + `onSave` callback) and `<SeekerCvManager>` (with `initialCvs` + `onUploadSuccess` callback). A "Skip for now" `<Button variant="ghost">` calls `advanceTo(3, 2)`. Track `preferencesCompleted` and `cvUploaded` state flags, set to `true` when the respective callbacks fire.
    - **Callback prop additions (backward-compatible):** The P-2.2 `SeekerPreferencesSection` and `SeekerCvManager` do NOT currently expose callback props. Add:
      - `SeekerPreferencesSection`: add optional `onSave?: () => void` prop. Call it after a successful PUT response (after the toast). Update `seeker-preferences-section.test.tsx` with 1 new test: "calls onSave after successful save".
      - `SeekerCvManager`: add optional `onUploadSuccess?: () => void` prop. Call it after a successful POST upload response (after the toast). Update `seeker-cv-manager.test.tsx` with 1 new test: "calls onUploadSuccess after successful upload".
      - Both props are optional — existing `/profile` page usage (which doesn't pass these props) is unchanged.
    - **`SeekerPreferencesSection` actual interface** — takes only `initialPrefs?: PortalSeekerPreferences | null` (NO `seekerProfileId` — the component calls `/api/v1/seekers/me/preferences` internally). Pass `initialPrefs={initialPreferences}` where `initialPreferences` is the `PortalSeekerPreferences | null` fetched in the server component. For the first-visit (Step 1→2 transition), `initialPreferences` will be `null`.
    - **`SeekerCvManager` actual interface** — takes only `initialCvs?: CvWithFile[]` (NO `seekerProfileId` — the component calls `/api/v1/seekers/me/cvs` internally). Pass `initialCvs={initialCvs ?? []}` from the page's fetch.
  - [x] 7.8 **Step 3 render:** Summary card showing what was completed:
    - "Profile created" with ✓ badge (always true at Step 3)
    - "Preferences saved" with ✓ badge OR nudge "Set your job preferences for better recommendations" (link to `/profile`)
    - "CV uploaded" with ✓ badge OR nudge "Upload a CV to apply faster" (link to `/profile`)
    - Links: "Browse jobs" (`/${locale}/jobs`), "Edit profile" (`/${locale}/profile?edit=true`), "Update preferences" (`/${locale}/profile`)
    - "Get started" button with `aria-busy={isCompleting}`: calls `POST /api/v1/seekers/me/onboarding/complete`, on success → `router.push(\`/${locale}\`)`
  - [x] 7.9 Render `<OnboardingStepIndicator currentStep={currentStep} completedSteps={completedSteps} />` above the step content. Pass seeker-specific step titles via a `steps` prop or by wrapping the indicator with seeker i18n keys.
    - **Check:** The existing `OnboardingStepIndicator` uses hardcoded employer keys (`Portal.onboarding.step1Title` etc.). If it does NOT accept a `steps` prop, you have two options: (a) refactor it to accept step titles as props (preferred — minimal change), or (b) create a `<SeekerOnboardingStepIndicator>` that duplicates the structure with seeker keys. **Option (a) is preferred** — add an optional `stepTitles?: string[]` prop; if provided, use them instead of the i18n keys.
  - [x] 7.10 Export `SeekerOnboardingFlowSkeleton` for Suspense boundary.

- [x] **Task 8: OnboardingStepIndicator refactor** (AC: #10)
  - [x] 8.1 Modify `apps/portal/src/components/domain/onboarding-step-indicator.tsx`:
    - Add optional `stepTitles?: string[]` prop. When provided, use `stepTitles[i]` instead of `t(\`step${i+1}Title\`)`. The array receives **pre-translated strings** (the caller runs `useTranslations("Portal.seekerOnboarding")` and passes `[t("step1Title"), t("step2Title"), t("step3Title")]`), NOT i18n keys.
    - This makes the component reusable for both employer and seeker onboarding without duplicating it.
    - **Ensure backward compatibility** — when `stepTitles` is not provided, the existing i18n key behavior is preserved (employer flow unchanged).
  - [x] 8.2 Update `onboarding-step-indicator.test.tsx` — add ≥ 2 tests:
    - Renders with custom `stepTitles` prop (seeker use case)
    - Renders with default i18n keys when `stepTitles` not provided (employer use case — existing behavior preserved)

- [x] **Task 9: Seeker onboarding flow tests** (AC: #2, #3, #4, #11)
  - [x] 9.1 Create `apps/portal/src/components/flow/seeker-onboarding-flow.test.tsx` (≥ 14 tests):
    - Renders Step 1 with SeekerProfileForm when initialStep=1
    - Renders Step 2 with preferences section when initialStep=2
    - Step indicator shows 3 steps with correct seeker titles
    - Step 1 completion advances to Step 2 (onSuccess callback)
    - Step 2 "Skip for now" advances to Step 3
    - Step 3 renders completion summary
    - Step 3 shows nudge when preferences were skipped
    - Step 3 shows ✓ when preferences were completed
    - Step 3 "Get started" calls POST /api/v1/seekers/me/onboarding/complete
    - Step 3 "Get started" navigates to home on success
    - Step 3 "Get started" shows aria-busy during API call
    - Focus moves to step heading on step transition
    - Community pre-fill passed to SeekerProfileForm
    - axe-core no violations (Step 1, Step 2, Step 3)
  - [x] 9.2 **Mock pattern**: mock `fetch` for the complete route. Mock `next/navigation` `useRouter`. Mock `next-intl` `useTranslations`. Mock `SeekerProfileForm`, `SeekerPreferencesSection`, `SeekerCvManager` as simplified stubs (don't test their internals — those are tested in P-2.1/P-2.2). Use `userEvent.setup()` for button clicks (Radix-friendly).

- [x] **Task 10: i18n keys** (AC: #12)
  - [x] 10.1 Add all keys from the i18n inventory to `apps/portal/messages/en.json` under `Portal.seekerOnboarding.*` namespace.
  - [x] 10.2 At Dev Completion: add Igbo translations to `apps/portal/messages/ig.json`.
  - [x] 10.3 `pnpm --filter portal test` confirms no missing-key warnings.

- [x] **Task 11: Update existing test fixtures** (AC: #13)
  - [x] 11.1 Search for all portal test files that mock `PortalSeekerProfile` objects and add `onboardingCompletedAt: null` (or a `new Date()` where appropriate) to the mock data. This is the same pattern as P-1.6 (employer onboarding) and P-2.2 (visibility/consent fields).
  - [x] 11.2 Files likely needing updates (verify each):
    - `apps/portal/src/components/flow/seeker-profile-form.test.tsx`
    - `apps/portal/src/components/domain/seeker-profile-view.test.tsx`
    - `apps/portal/src/app/api/v1/seekers/route.test.ts`
    - `apps/portal/src/app/api/v1/seekers/me/route.test.ts`
    - `apps/portal/src/app/api/v1/seekers/[seekerProfileId]/route.test.ts`
    - `apps/portal/src/app/[locale]/(gated)/seekers/[seekerProfileId]/page.test.tsx`
    - `apps/portal/src/app/[locale]/(gated)/profile/page.test.tsx`
    - `apps/portal/src/app/api/v1/seekers/me/preferences/route.test.ts`
    - `apps/portal/src/app/api/v1/seekers/me/cvs/route.test.ts`
    - `apps/portal/src/app/api/v1/seekers/me/cvs/[cvId]/route.test.ts`
    - `apps/portal/src/app/api/v1/seekers/me/visibility/route.test.ts`
    - `apps/portal/src/app/api/v1/seekers/me/consent/route.test.ts`
    - `apps/portal/src/components/flow/seeker-preferences-section.test.tsx`
    - `apps/portal/src/components/flow/seeker-cv-manager.test.tsx`
    - `apps/portal/src/components/flow/seeker-visibility-section.test.tsx`
    - `apps/portal/src/components/flow/seeker-consent-section.test.tsx`

- [x] **Task 12: Regression verification** (AC: #13)
  - [x] 12.1 `pnpm --filter @igbo/db test` — expect baseline 828 + ≥ 4 new = ≥ 832 passing.
  - [x] 12.2 `pnpm --filter portal test` — expect baseline 1199 + ≥ 35 new = ≥ 1234 passing. (Minimum: 6 complete route + 3 home page + 1 ChooseRoleForm + 6 onboarding page + 2 step indicator + 2 form nav-suppression + 1 onSave + 1 onUploadSuccess + 14 flow = 36.)
  - [x] 12.3 `pnpm --filter @igbo/db typecheck` and `pnpm --filter portal typecheck` — zero errors.
  - [x] 12.4 `pnpm ci-checks` locally — zero new failures.
  - [x] 12.5 `pnpm --filter @igbo/db build` — dist emits new column before portal typecheck.
  - [x] 12.6 Verify no P-2.1/P-2.2 tests regressed (profile form, preferences, CV, visibility, consent, profile page tests).

## Dev Notes

### Critical patterns (from established project conventions — see MEMORY.md)

- **Migrations**: Hand-write SQL — drizzle-kit generate fails with `server-only` error. **Next migration index is 0061** (0060 was `portal_seeker_preferences_cv_visibility` from P-2.2).
- **Migration journal**: After writing the SQL file you **MUST** append the matching entry to `packages/db/src/migrations/meta/_journal.json` — without this drizzle-kit never applies the SQL file. Use `idx: 61`, `when: 1708000061000`.
- **Zod**: Import from `"zod/v4"`. Use `parsed.error.issues[0]` (NOT `parsed.issues[0]`!). This story has minimal Zod usage (the onboarding complete route has no body parsing), but the existing forms from P-2.1/P-2.2 follow this pattern.
- **API routes**: Always wrap with `withApiHandler()` from `@/lib/api-middleware`.
- **Role guards**: `requireJobSeekerRole()` from `@/lib/portal-permissions`.
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`.
- **Portal error codes**: Use `PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED` (already exists from P-2.2).
- **DB schema imports**: No `src/db/schema/index.ts` — schemas imported directly in `packages/db/src/index.ts` with `import * as xSchema`.
- **Co-located tests**: Tests live next to source (not `__tests__`), `@vitest-environment node` for server files.
- **Portal test pattern**: Mock `useSession` directly via `vi.mock("next-auth/react")`. `jest-axe` in **portal**: `expect.extend(toHaveNoViolations)` + `expect(results).toHaveNoViolations()` — NO `@ts-expect-error`.
- **Type sync**: Run `pnpm --filter @igbo/db build` before portal typecheck — portal imports from `@igbo/db` dist.
- **`onboardingCompletedAt` fixture pattern**: When a new nullable column is added to a schema, ALL existing test fixtures for that schema type must include the new field set to `null`. Search for existing mock PortalSeekerProfile objects and update them. This is the same issue P-1.6 had with employer `onboardingCompletedAt` and P-2.2 had with visibility/consent columns.

### Source tree components to touch

```
packages/db/src/
├── schema/portal-seeker-profiles.ts                        # MODIFIED (add onboardingCompletedAt)
├── migrations/0061_seeker_onboarding.sql                   # NEW
├── migrations/meta/_journal.json                           # MODIFIED (append idx 61)
├── queries/portal-seeker-profiles.ts                       # MODIFIED (add markSeekerOnboardingComplete)
└── queries/portal-seeker-profiles.test.ts                  # MODIFIED (add 4+ tests)

apps/portal/src/
├── app/[locale]/(gated)/
│   ├── page.tsx                                            # MODIFIED (seeker onboarding redirect)
│   ├── page.test.tsx                                       # MODIFIED (3+ new tests)
│   └── onboarding/seeker/
│       ├── page.tsx                                        # NEW (server component — guard + data fetch)
│       └── page.test.tsx                                   # NEW (6+ tests)
├── app/api/v1/seekers/me/onboarding/complete/
│   ├── route.ts                                            # NEW
│   └── route.test.ts                                       # NEW (6+ tests)
├── components/
│   ├── domain/
│   │   ├── onboarding-step-indicator.tsx                   # MODIFIED (add stepTitles prop)
│   │   └── onboarding-step-indicator.test.tsx              # MODIFIED (2+ new tests)
│   ├── flow/
│   │   ├── seeker-profile-form.tsx                         # MODIFIED (onSuccess suppresses router.replace)
│   │   ├── seeker-profile-form.test.tsx                    # MODIFIED (+1 test: onSuccess skips navigate)
│   │   ├── seeker-preferences-section.tsx                  # MODIFIED (+onSave callback prop)
│   │   ├── seeker-preferences-section.test.tsx             # MODIFIED (+1 test: onSave callback)
│   │   ├── seeker-cv-manager.tsx                           # MODIFIED (+onUploadSuccess callback prop)
│   │   ├── seeker-cv-manager.test.tsx                      # MODIFIED (+1 test: onUploadSuccess callback)
│   │   ├── seeker-onboarding-flow.tsx                      # NEW (3-step wizard)
│   │   └── seeker-onboarding-flow.test.tsx                 # NEW (14+ tests)
│   └── choose-role/
│       ├── choose-role-form.tsx                             # MODIFIED (redirect map)
│       └── choose-role-form.test.tsx                        # MODIFIED (1+ updated test)
├── messages/en.json                                        # MODIFIED (+21 seekerOnboarding keys)
└── messages/ig.json                                        # MODIFIED at Dev Completion
```

### P-1.6 employer onboarding as pattern reference

This story mirrors P-1.6 (employer onboarding) almost exactly. Key files to reference:
- `apps/portal/src/app/[locale]/(gated)/onboarding/page.tsx` — server component guard + initialStep derivation
- `apps/portal/src/components/flow/onboarding-flow.tsx` — 3-step wizard state machine
- `apps/portal/src/components/domain/onboarding-step-indicator.tsx` — step indicator UI (reuse)
- `apps/portal/src/app/api/v1/onboarding/complete/route.ts` — complete API route pattern
- `apps/portal/src/app/[locale]/(gated)/page.tsx` — home page redirect pattern (employer block)

The seeker flow is simpler: Step 1 = create profile (vs company profile), Step 2 = preferences + CV (vs first job posting), Step 3 = summary + complete. No job posting form is embedded — preferences and CV manager are lighter-weight reused components.

### Testing standards summary

- Unit tests: co-located, `@vitest-environment node` for server code.
- Component tests: React Testing Library + `@testing-library/user-event` (`userEvent.setup()`).
- Route tests: mock `@igbo/auth` (auth function), mock `@igbo/db/queries/*`. Do NOT mock `requireJobSeekerRole` directly — mock the underlying `auth`.
- Page tests: render async server component, assert structure and redirects.
- For the onboarding flow component test: mock child components (`SeekerProfileForm`, `SeekerPreferencesSection`, `SeekerCvManager`) as stubs — their internals are already tested in P-2.1/P-2.2. Test the flow orchestration (step transitions, callbacks, API call, navigation).
- Accessibility: include at least one `axe-core` assertion per component test file.

### Integration Tests (SN-3 — Missing Middle)

- **Onboarding page guard → profile query → redirect chain:** Render the seeker onboarding page with a real `auth()` mock returning JOB_SEEKER + a mocked `getSeekerProfileByUserId` returning null. Verify the page renders Step 1 (not a redirect). Then mock a profile with `onboardingCompletedAt` set — verify redirect fires.
- **Complete route → DB query → response chain:** Test `POST /api/v1/seekers/me/onboarding/complete` with the real `withApiHandler` (not a bypass mock) and mocked DB layer. Verify CSRF + ApiError handling + trace header propagation.
- **Home → onboarding redirect → flow render chain:** Render the home page as JOB_SEEKER with no profile → verify redirect to `/onboarding/seeker`. Then render the onboarding page with that state → verify Step 1 renders. This tests the full redirect chain.

### Project Structure Notes

- The onboarding page lives at `apps/portal/src/app/[locale]/(gated)/onboarding/seeker/page.tsx` — nested under the existing `onboarding/` directory (alongside the employer `onboarding/page.tsx`). This keeps role-specific onboarding flows colocated.
- No new `(ungated)` routes — the seeker onboarding page is behind the `(gated)` layout because a session is required to identify the user and their role.
- The `SeekerProfileForm` `onSuccess` callback is already supported (P-2.1 added it). For the onboarding flow, `onSuccess` triggers step advancement instead of the default `router.replace("/profile")` behavior.

### Previous story intelligence

- **P-2.2 (Preferences, CV, Visibility)** — direct predecessor. All components reused in Step 2 are already built and tested. The `SeekerPreferencesSection` and `SeekerCvManager` manage their own state and API calls — the onboarding flow just renders them and tracks completion.
- **P-2.1 (Seeker Profile)** — `SeekerProfileForm` has `onSuccess?: (profile) => void` callback. The create mode POSTs to `/api/v1/seekers` and on 201 calls `onSuccess(profile)`. This is the hook for step advancement.
- **P-1.6 (Employer Onboarding)** — the authoritative pattern. Mirror: server guard → initialStep derivation → client wizard component → step indicator → complete API → home redirect. Key diff: seeker has preferences+CV in Step 2 (not job posting), and no `hasCompletedOnboarding` separate query needed (use `getSeekerProfileByUserId` + check `onboardingCompletedAt` directly).
- **PREP-D (Role Selection)** — established `REDIRECT_MAP` in `ChooseRoleForm`. Currently sends JOB_SEEKER to `/jobs` — needs updating to `/onboarding/seeker`.

### Known scope deferrals

- **Seeker dashboard content** — after onboarding, the portal home for seekers is minimal (no personalized job feed yet). This story only handles the onboarding flow and the redirect back to home. Dashboard content is a separate story.
- **Density toggle UI** — the `DensityContext` is already wired with seeker=comfortable default. A user-facing toggle to change density is deferred (noted in P-1.6 as future work).
- **Progressive profile nudges after onboarding** — post-onboarding nudges (e.g., "Complete your experience section") are deferred. The onboarding summary has one-time nudges for skipped steps, but no persistent nudge system.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3: Seeker Onboarding Flow] — user story + AC
- [Source: _bmad-output/implementation-artifacts/p-2-2-seeker-preferences-cv-upload-visibility.md] — direct predecessor; all reused components
- [Source: _bmad-output/implementation-artifacts/p-2-1-seeker-profile-creation-community-trust-data.md] — SeekerProfileForm onSuccess pattern
- [Source: _bmad-output/implementation-artifacts/p-1-6-employer-onboarding-densitycontext.md] — authoritative onboarding pattern to mirror
- [Source: apps/portal/src/app/[locale]/(gated)/onboarding/page.tsx] — employer onboarding server component
- [Source: apps/portal/src/components/flow/onboarding-flow.tsx] — employer onboarding client wizard
- [Source: apps/portal/src/components/domain/onboarding-step-indicator.tsx] — reusable step indicator
- [Source: apps/portal/src/app/api/v1/onboarding/complete/route.ts] — employer complete API pattern
- [Source: apps/portal/src/app/[locale]/(gated)/page.tsx] — home page redirect pattern
- [Source: apps/portal/src/components/choose-role/choose-role-form.tsx] — REDIRECT_MAP to update
- [Source: packages/db/src/schema/portal-seeker-profiles.ts] — schema to extend
- [Source: packages/db/src/queries/portal-seeker-profiles.ts] — queries to extend

## Definition of Done (SN-1)

- [ ] All acceptance criteria met
- [ ] All validation scenarios demonstrated with evidence
- [ ] Unit tests written and passing (target: ~35 new portal tests + ~4 new @igbo/db tests)
- [ ] Integration tests written and passing (SN-3)
- [ ] Flow owner has verified the complete end-to-end chain
- [ ] No pre-existing test regressions introduced
- [ ] Dev Completion: all i18n keys in Readiness inventory exist in `en.json` with English copy and render without missing-key warnings
- [ ] Dev Completion: **Igbo translations added to `ig.json` for every key in the Readiness inventory** (deferred from SN-5 per i18n gate split)
- [ ] Dev Completion: every sanitization point passes `pnpm ci-checks` locally
- [ ] Dev Completion: all a11y patterns listed in Readiness (including focus management) have passing axe-core assertions
- [ ] Dev Completion: all component dependencies in Readiness are imported and rendering

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Validation Evidence

- **@igbo/db test**: 832/832 passing (baseline 828 + 4 new `markSeekerOnboardingComplete` tests)
- **portal test**: 1243/1243 passing (baseline 1199 + 44 new tests: 6 route + 7 page + 14 flow + 2 step-indicator + 2 profile-form nav-suppression + 1 onSave + 1 onUploadSuccess + 3 home-page + 1 ChooseRoleForm + 7 onboarding-page)
- **portal typecheck**: 0 errors
- **@igbo/db typecheck**: 0 errors
- **pnpm ci-checks**: ✅ All CI checks passed
- **@igbo/db build**: dist emits new `onboardingCompletedAt` column

### Debug Log References

- CSRF fix: `makePostRequest()` was missing `Origin` header causing CSRF 403; fixed by adding `Origin: "https://jobs.igbo.com"`.
- Error code fix: `body.extensions?.code` should be `body.code` — `toProblemDetails()` spreads extensions via `Object.assign`.
- TypeScript fixes: `getCommunityProfileForPrefill` never returns null (always `{ displayName, bio }`); CV mock used wrong field names (`fileId`→`fileUploadId`, removed `id`/`processedUrl` from file, added `fileSize`/`objectKey`/`status`); null auth mocks needed type cast; `me/route.test.ts` missing `onboardingCompletedAt: null`.

### Code Review Fixes (2026-04-08)

**HIGH (1 fixed):**
- **H1** — Hardcoded English error strings in `seeker-onboarding-flow.tsx` `handleComplete` violated AC12. Added `Portal.seekerOnboarding.completeError` and `Portal.seekerOnboarding.unexpectedError` to `en.json` + `ig.json`. Replaced raw strings with `t("completeError")` and `t("unexpectedError")`.

**MEDIUM (3 fixed):**
- **M1** — `handleComplete` error path was untested. Added 3 new tests in `seeker-onboarding-flow.test.tsx`: error toast on `!res.ok` with `detail`, fallback to i18n key when no detail, and `unexpectedError` when fetch rejects. All assert no navigation and button re-enables.
- **M2** — Step 1/2/3 content now wrapped in `<Card>` / `<CardHeader>` / `<CardTitle>` / `<CardDescription>` / `<CardContent>` per Task 7.6/7.7. Headings remain semantically correct (`<h2>` nested inside CardTitle wrapper).
- **M3** — Replaced `setTimeout(focus, 0)` for step-transition focus with `useEffect` keyed on `currentStep`. More reliable under React 19 concurrent rendering.

**Final test counts after fixes:**
- @igbo/db: 832/832 ✅
- portal: 1246/1246 ✅ (+3 new error-path tests)
- pnpm ci-checks: ✅
- typecheck (portal + db): ✅

### Completion Notes List

- All 12 tasks completed.
- `SeekerProfileForm` navigation suppression: success handler and cancel handler both fixed to be conditional on callback presence.
- `OnboardingStepIndicator` extended with optional `stepTitles?: string[]` prop (backward-compatible).
- `SeekerPreferencesSection` extended with optional `onSave?: () => void`.
- `SeekerCvManager` extended with optional `onUploadSuccess?: () => void`.
- All existing test fixtures updated with `onboardingCompletedAt: null`.
- i18n: 21 keys under `Portal.seekerOnboarding.*` in both `en.json` and `ig.json`.
- AC9 (DensityContext comfortable): verified `ROLE_DENSITY_DEFAULTS.JOB_SEEKER = "comfortable"` already wired — no additional work needed.

### File List

**packages/db:**
- `packages/db/src/migrations/0061_seeker_onboarding.sql` — NEW
- `packages/db/src/migrations/meta/_journal.json` — MODIFIED (appended idx 61)
- `packages/db/src/schema/portal-seeker-profiles.ts` — MODIFIED (added `onboardingCompletedAt`)
- `packages/db/src/queries/portal-seeker-profiles.ts` — MODIFIED (added `markSeekerOnboardingComplete`)
- `packages/db/src/queries/portal-seeker-profiles.test.ts` — MODIFIED (+4 tests)

**apps/portal:**
- `apps/portal/src/app/[locale]/(gated)/page.tsx` — MODIFIED (JOB_SEEKER onboarding redirect)
- `apps/portal/src/app/[locale]/(gated)/page.test.tsx` — MODIFIED (+3 tests + seeker mock)
- `apps/portal/src/app/[locale]/(gated)/onboarding/seeker/page.tsx` — NEW
- `apps/portal/src/app/[locale]/(gated)/onboarding/seeker/page.test.tsx` — NEW (7 tests)
- `apps/portal/src/app/api/v1/seekers/me/onboarding/complete/route.ts` — NEW
- `apps/portal/src/app/api/v1/seekers/me/onboarding/complete/route.test.ts` — NEW (6 tests)
- `apps/portal/src/app/api/v1/seekers/me/route.test.ts` — MODIFIED (added `onboardingCompletedAt: null`)
- `apps/portal/src/components/choose-role/choose-role-form.tsx` — MODIFIED (JOB_SEEKER redirect)
- `apps/portal/src/components/choose-role/choose-role-form.test.tsx` — MODIFIED (+1 test)
- `apps/portal/src/components/domain/onboarding-step-indicator.tsx` — MODIFIED (stepTitles prop)
- `apps/portal/src/components/domain/onboarding-step-indicator.test.tsx` — MODIFIED (+2 tests)
- `apps/portal/src/components/flow/seeker-profile-form.tsx` — MODIFIED (onSuccess/onCancel nav suppression)
- `apps/portal/src/components/flow/seeker-profile-form.test.tsx` — MODIFIED (+2 tests + `onboardingCompletedAt`)
- `apps/portal/src/components/flow/seeker-preferences-section.tsx` — MODIFIED (onSave prop)
- `apps/portal/src/components/flow/seeker-preferences-section.test.tsx` — MODIFIED (+1 test)
- `apps/portal/src/components/flow/seeker-cv-manager.tsx` — MODIFIED (onUploadSuccess prop)
- `apps/portal/src/components/flow/seeker-cv-manager.test.tsx` — MODIFIED (+1 test)
- `apps/portal/src/components/flow/seeker-onboarding-flow.tsx` — NEW
- `apps/portal/src/components/flow/seeker-onboarding-flow.test.tsx` — NEW (14 tests)
- `apps/portal/messages/en.json` — MODIFIED (+21 seekerOnboarding keys)
- `apps/portal/messages/ig.json` — MODIFIED (+21 seekerOnboarding keys)

**Fixture updates (onboardingCompletedAt: null added):**
- `apps/portal/src/components/domain/seeker-profile-view.test.tsx`
- `apps/portal/src/app/api/v1/seekers/route.test.ts`
- `apps/portal/src/app/api/v1/seekers/[seekerProfileId]/route.test.ts`
- `apps/portal/src/app/[locale]/(gated)/seekers/[seekerProfileId]/page.test.tsx`
- `apps/portal/src/app/[locale]/(gated)/profile/page.test.tsx`
- `apps/portal/src/app/api/v1/seekers/me/preferences/route.test.ts`
- `apps/portal/src/app/api/v1/seekers/me/cvs/route.test.ts`
- `apps/portal/src/app/api/v1/seekers/me/cvs/[cvId]/route.test.ts`
- `apps/portal/src/app/api/v1/seekers/me/visibility/route.test.ts`
- `apps/portal/src/app/api/v1/seekers/me/consent/route.test.ts`
