# Story P-2.1: Seeker Profile Creation & Community Trust Data

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a job seeker,
I want to create a professional profile that auto-fills from my community platform data and displays my community trust signals,
so that employers can see my qualifications alongside my community reputation without me re-entering information.

## Acceptance Criteria

1. **AC1 — `portal_seeker_profiles` schema & migration** — A new migration `0059_portal_seeker_profiles.sql` creates table `portal_seeker_profiles` with columns: `id` (uuid PK default gen_random_uuid), `user_id` (uuid FK → `auth_users.id` ON DELETE CASCADE, UNIQUE — one profile per user), `headline` (varchar 200 NOT NULL), `summary` (text), `skills` (text[] NOT NULL default `'{}'`), `experience_json` (jsonb NOT NULL default `'[]'`), `education_json` (jsonb NOT NULL default `'[]'`), `created_at` (timestamptz default now() NOT NULL), `updated_at` (timestamptz default now() NOT NULL). Add index on `user_id`. The migration is registered in `packages/db/src/migrations/meta/_journal.json` as idx 59 with tag `0059_portal_seeker_profiles`, and a matching Drizzle schema file `packages/db/src/schema/portal-seeker-profiles.ts` exports `portalSeekerProfiles`, `PortalSeekerProfile`, `NewPortalSeekerProfile`, `SeekerExperience`, `SeekerEducation` types. The schema is wired into `packages/db/src/index.ts` (spread into schemaMap).

2. **AC2 — Seeker profile creation form** — An authenticated user with `activePortalRole === "JOB_SEEKER"` who navigates to `/profile` (inside `(gated)` layout) sees a form at `/profile?edit=true` (or when no profile exists) with fields: headline (required, max 200), summary (textarea, optional, max 5000), skills (tag input, multi-string, max 30 items, each max 50 chars), experience list (repeatable rows of {title, company, startDate (YYYY-MM), endDate (YYYY-MM or "Present"), description}), education list (repeatable rows of {institution, degree, field, graduationYear}). Submitting a valid form POSTs to `/api/v1/seekers` which creates a `portal_seeker_profiles` row linked to the authenticated user. Duplicate POST returns 409 with `PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE`.

3. **AC3 — Community data pre-fill** — On first load of the create form, headline pre-fills from community `displayName` (or empty) and summary pre-fills from community `bio` (stubbed — can be empty). Pre-fill is fetched by a new query `getCommunityProfileForPrefill(userId)` in `packages/db/src/queries/cross-app.ts` returning `{ displayName: string | null, bio: string | null }`. The user can edit all pre-filled values before saving. Pre-fill is performed server-side in the page component (no client-side fetch).

4. **AC4 — Seeker profile editing** — A seeker who already has a profile who navigates to `/profile` sees a view mode with their current data and an "Edit" button. Edit mode is triggered via `?edit=true` query param (URL-based, consistent with `/company-profile` pattern). On save, the form PATCHes `/api/v1/seekers/{seekerProfileId}`. The owner check is server-side (`profile.userId === session.user.id`). `updated_at` refreshes. A success toast is shown and the page returns to view mode.

5. **AC5 — Public seeker profile view with community trust signals** — A route `/seekers/[seekerProfileId]/page.tsx` renders a read-only seeker profile view accessible to authenticated users with `activePortalRole` in {`EMPLOYER`, `JOB_ADMIN`}. Non-authorized roles get a 403 redirect / `notFound()`. The page displays: headline, summary, skills (as pills), experience list, education list, and a **community trust signals panel** showing: verification badge (if any), membership duration ("Member since YYYY"), community points (numeric score), badge type (blue/red/purple) if present, and engagement level pill. Trust signals are read from community tables via a new wrapper `getSeekerTrustSignals(userId)` in `cross-app.ts` that returns `{ isVerified, badgeType, memberSince, memberDurationDays, communityPoints, engagementLevel, displayName }`. Trust data is NOT duplicated into `portal_seeker_profiles` — it is always a cross-app read. Warm-tone colors consistent with existing `TrustBadge` semantic component.

6. **AC6 — Seeker profile API routes** — Three routes exist, all wrapped with `withApiHandler` and using portal `ApiError` / `successResponse`:
   - `POST /api/v1/seekers` — authenticated via `requireJobSeekerRole()`, creates profile, 409 on duplicate, 201 on success.
   - `GET /api/v1/seekers/me` — authenticated via `requireJobSeekerRole()`, returns own profile or `null` (not 404 — absence is valid).
   - `GET /api/v1/seekers/[seekerProfileId]` — authenticated via `auth()`, restricted to `EMPLOYER`/`JOB_ADMIN` roles (throws `ApiError` 403 with `ROLE_MISMATCH` otherwise), returns `{ ...profile, trustSignals, user: { displayName } }`, 404 if not found.
   - `PATCH /api/v1/seekers/[seekerProfileId]` — authenticated via `requireJobSeekerRole()`, owner check (`profile.userId === session.user.id` else 403), partial update via `seekerProfileSchema.partial()`, 200 on success.
   Every validation failure uses `throw new ApiError(...)` (never `errorResponse(string, 400)` — see Dev Notes).

7. **AC7 — `@igbo/db` queries** — `packages/db/src/queries/portal-seeker-profiles.ts` exports: `createSeekerProfile(data)`, `getSeekerProfileByUserId(userId)`, `getSeekerProfileById(id)`, `updateSeekerProfile(id, patch)`. `packages/db/src/queries/cross-app.ts` is **extended** (not rewritten) with: `getCommunityProfileForPrefill(userId)` and `getSeekerTrustSignals(userId)` (plus exported `SeekerTrustSignals` interface). The existing functions remain untouched. Query tests co-located next to the source file.

8. **AC8 — Zod validation** — `apps/portal/src/lib/validations/seeker-profile.ts` exports `seekerProfileSchema`, `experienceEntrySchema`, `educationEntrySchema`, plus inferred types. Uses `zod/v4` (consistent with other portal schemas). Rules: headline required 1..200; summary optional max 5000; skills array 0..30 of 1..50-char strings; experience array 0..20 with each entry requiring `title` (1..200), `company` (1..200), `startDate` (YYYY-MM format regex), `endDate` (YYYY-MM or "Present"), `description` (optional, max 2000); education array 0..10 with `institution` (1..200), `degree` (1..100), `field` (1..100), `graduationYear` (int 1950..currentYear+7).

9. **AC9 — Accessibility** — Every form input has an associated `<label>`, error messages use `aria-describedby`, the repeatable experience/education rows use `role="group"` with `aria-labelledby`, "Add experience"/"Remove" buttons are keyboard-operable, focus moves to the first error field on failed submission and to the newly added row on "Add", and axe-core assertions pass on `SeekerProfileForm`, `SeekerProfileView`, `TrustSignalsPanel`, and both pages.

10. **AC10 — i18n complete** — All new user-facing strings use keys under `Portal.seeker.*` (form copy, empty states, errors, CTAs) and `Portal.trust.*` (new trust signal fields only — reuse existing keys where present). English copy committed in `apps/portal/messages/en.json`. Igbo copy committed in `apps/portal/messages/ig.json` at Dev Completion (per SN-5 i18n gate split). No hardcoded user-visible strings.

11. **AC11 — One profile per user** — DB UNIQUE constraint on `portal_seeker_profiles.user_id` enforces one profile per user. POST route pre-checks via `getSeekerProfileByUserId` and returns 409 `DUPLICATE_SEEKER_PROFILE` rather than relying on DB exception alone. `PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE` is added to `apps/portal/src/lib/portal-errors.ts`.

12. **AC12 — Gated routing** — `/profile` lives under `(gated)` layout (inherits auth + role hydration). Non-JOB_SEEKER roles who navigate to `/profile` are redirected to the portal home page. Non-authenticated users are redirected to sign-in by the existing `(gated)` layout.

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

**Gate Owner:** Scrum Master (enforces before story moves to `ready-for-dev`)
**Source of Rules:** `docs/monorepo-playbook.md` → §7 Frontend Safety & Readiness

### i18n Key Inventory

- [x] Every user-facing string in the UI mocks / ACs maps to a key below
- [x] English copy filled in for every row
- [x] Keys reserved in `apps/portal/messages/en.json` (Igbo copy at Dev Completion)
- Keys:
  - `Portal.seeker.pageTitleCreate` — "Create your seeker profile"
  - `Portal.seeker.pageTitleEdit` — "Edit your seeker profile"
  - `Portal.seeker.pageTitleView` — "Your seeker profile"
  - `Portal.seeker.headlineLabel` — "Headline"
  - `Portal.seeker.headlinePlaceholder` — "e.g. Senior Full-Stack Engineer"
  - `Portal.seeker.headlineHelp` — "A short tagline employers see first."
  - `Portal.seeker.summaryLabel` — "Professional summary"
  - `Portal.seeker.summaryPlaceholder` — "Briefly introduce yourself and your experience."
  - `Portal.seeker.skillsLabel` — "Skills"
  - `Portal.seeker.skillsHelp` — "Press Enter or comma to add a skill. Up to 30 skills."
  - `Portal.seeker.skillsPlaceholder` — "Add a skill"
  - `Portal.seeker.skillsEmpty` — "No skills added yet."
  - `Portal.seeker.experienceLabel` — "Work experience"
  - `Portal.seeker.experienceAdd` — "Add experience"
  - `Portal.seeker.experienceEmpty` — "No experience added yet."
  - `Portal.seeker.experienceRemove` — "Remove this experience entry"
  - `Portal.seeker.experienceTitle` — "Job title"
  - `Portal.seeker.experienceCompany` — "Company"
  - `Portal.seeker.experienceStartDate` — "Start date"
  - `Portal.seeker.experienceEndDate` — "End date"
  - `Portal.seeker.experiencePresent` — "Present"
  - `Portal.seeker.experienceDescription` — "What you did"
  - `Portal.seeker.educationLabel` — "Education"
  - `Portal.seeker.educationAdd` — "Add education"
  - `Portal.seeker.educationEmpty` — "No education added yet."
  - `Portal.seeker.educationRemove` — "Remove this education entry"
  - `Portal.seeker.educationInstitution` — "Institution"
  - `Portal.seeker.educationDegree` — "Degree"
  - `Portal.seeker.educationField` — "Field of study"
  - `Portal.seeker.educationGraduationYear` — "Graduation year"
  - `Portal.seeker.saveCreate` — "Create profile"
  - `Portal.seeker.saveUpdate` — "Save changes"
  - `Portal.seeker.cancel` — "Cancel"
  - `Portal.seeker.edit` — "Edit profile"
  - `Portal.seeker.successCreated` — "Profile created"
  - `Portal.seeker.successUpdated` — "Profile updated"
  - `Portal.seeker.errorGeneric` — "Something went wrong. Please try again."
  - `Portal.seeker.errorDuplicate` — "You already have a seeker profile."
  - `Portal.seeker.errorValidation` — "Please correct the highlighted fields."
  - `Portal.seeker.prefilledBanner` — "We pre-filled some fields from your community profile. Feel free to edit."
  - `Portal.seeker.publicViewHeading` — "Seeker profile"
  - `Portal.seeker.skillsSection` — "Skills"
  - `Portal.seeker.experienceSection` — "Experience"
  - `Portal.seeker.educationSection` — "Education"
  - `Portal.seeker.trustSection` — "Community trust"
  - `Portal.seeker.notFound` — "Seeker profile not found"
  - `Portal.seeker.ariaLabelExperienceGroup` — "Experience entry {index}"
  - `Portal.seeker.ariaLabelEducationGroup` — "Education entry {index}"
  - `Portal.trust.communityPoints` — "{points} community points"
  - `Portal.trust.memberDurationDays` — "{days} days on the platform"
  - `Portal.trust.badgeBlue` — "Verified community member"
  - `Portal.trust.badgeRed` — "Community leader"
  - `Portal.trust.badgePurple` — "Trusted contributor"

### Sanitization Points

- [x] Every HTML rendering surface in this story is listed below
- [x] **OR** [N/A] — this story renders no HTML from strings. Justification: summary/description fields are rendered as plain text inside `<p>`/`<pre>` elements. No `dangerouslySetInnerHTML` is used. The repeatable experience `description` is rendered with `white-space: pre-wrap` but still as text, not HTML.

### Accessibility Patterns

- [x] Keyboard interaction pattern documented for every new interactive element
- [x] ARIA roles/labels listed for every semantically meaningful element
- [x] Focus management plan documented for every modal / dropdown / route transition in this story
- [x] axe-core assertions planned in component tests
- Elements:
  - **Headline input** — standard `<input>` + `<label>`, `aria-describedby="headline-error"` when invalid. Focus target on create mode mount.
  - **Summary textarea** — `<textarea>` + `<label>`, `aria-describedby="summary-char-count summary-error"`. Character counter has `aria-live="polite"`.
  - **Skills tag input** — Text input with Enter/Comma to add, Backspace to remove last, Delete button per tag with `aria-label="Remove skill {name}"`. Container has `role="group"` and `aria-labelledby="skills-label"`. Focus returns to input after tag add/remove.
  - **Experience "Add" button** — `<button type="button">` with `aria-label="Add experience"`. On click, focus moves to newly added row's first field (title).
  - **Experience row container** — `role="group"` with `aria-labelledby="exp-{i}-legend"` and a visually hidden `<h3 id="exp-{i}-legend">` providing "Experience entry {i}".
  - **Experience "Remove" button** — `<button type="button">` with `aria-label={t("experienceRemove")}`. On click, focus moves to the next remaining row's title, or to "Add experience" if list empty.
  - **Education rows** — same pattern as experience.
  - **Submit button** — `<button type="submit">` with `aria-busy` while saving.
  - **Cancel button** — `<button type="button">`. On click, navigates back to view mode (or portal home in create mode) — focus returns to "Edit profile" button in view mode.
  - **Trust signals panel** — `<section>` with `aria-labelledby="trust-heading"`. Each pill is non-interactive text.
  - **Focus management (route transitions):** After successful create/update, router replaces `?edit=true` with plain `/profile`; focus is moved to the page `<h1>` heading (via `ref.focus()` with `tabIndex={-1}`).

### Component Dependencies

- [x] Every shadcn/ui (or other vendored) component this story needs is listed below
- [x] Verified present in `apps/portal/src/components/ui/` OR added as a Task 0 subtask
- Components:
  - `Input`, `Label`, `Textarea`, `Button`, `Card`, `CardHeader`, `CardTitle`, `CardContent` — already present (verified from P-1.2 / P-1.3A).
  - `Badge` — needed for skill pills. **Check presence in `apps/portal/src/components/ui/`; if missing, add as Task 0.1 (copy from `apps/community/src/components/ui/badge.tsx`).**
  - `Separator` — needed between experience entries. **Check presence; if missing, add as Task 0.2 (copy from community).**
  - `toast` (sonner) — already wired from P-1.2.
  - `TrustBadge` semantic component — already present at `apps/portal/src/components/semantic/trust-badge.tsx`; new `TrustSignalsPanel` (this story) composes it with additional fields (points, badge type, duration).

## Validation Scenarios (SN-2 — REQUIRED)

1. **Seeker creates first profile with pre-fill** — Log in as JOB_SEEKER with no existing seeker profile. Navigate to `/profile`. Form renders in create mode with headline pre-filled from community `displayName` and summary from community `bio`. Fill headline, add 3 skills, add 1 experience row, add 1 education row. Click "Create profile".
   - Expected outcome: 201 response. Toast "Profile created". Page transitions to view mode at `/profile`. Saved data visible.
   - Evidence required: Screenshot of create form with pre-fill banner + saved view

2. **Seeker edits existing profile** — As a seeker with an existing profile, click "Edit profile". Change headline and add a skill. Save.
   - Expected outcome: 200 response, updated_at bumps, toast "Profile updated", returns to view mode.
   - Evidence required: Screenshot of edit form + updated view + network log showing PATCH 200

3. **Duplicate create is blocked** — Seeker with an existing profile POSTs to `/api/v1/seekers` again (e.g., via curl or devtools).
   - Expected outcome: 409 Conflict with code `PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE`.
   - Evidence required: API response body

4. **Employer views seeker profile with trust signals** — Log in as EMPLOYER. Navigate to `/seekers/{seekerProfileId}` for a seeker who has a community badge and > 100 community points.
   - Expected outcome: Page renders headline, summary, skills, experience, education, and a "Community trust" panel showing verification badge, member-since year, points count, badge type, and engagement level pill.
   - Evidence required: Screenshot of public seeker view

5. **Job seeker cannot view others' profiles publicly** — Log in as JOB_SEEKER. Attempt to navigate to `/seekers/{otherSeekerId}`.
   - Expected outcome: 403 (or redirect/notFound) — JOB_SEEKER is not in the {EMPLOYER, JOB_ADMIN} allowlist.
   - Evidence required: Screenshot or network response

6. **Unauthorized PATCH is rejected** — As JOB_SEEKER A, send PATCH to `/api/v1/seekers/{profileId of seeker B}`.
   - Expected outcome: 403 (owner check fails).
   - Evidence required: API response

7. **Form validation — empty headline** — Submit the create form with empty headline.
   - Expected outcome: Inline `aria-describedby` error on headline field; form does not submit; focus moves to headline input.
   - Evidence required: Screenshot of validation error + focus ring

8. **Skills cap enforced** — Attempt to add a 31st skill via the tag input.
   - Expected outcome: Input rejects the add with an inline helper message ("Up to 30 skills.") and the tag is not inserted.
   - Evidence required: Screenshot of capped state

## Flow Owner (SN-4)

**Owner:** Dev (developer)

## Tasks / Subtasks

- [x] **Task 0: Vendored UI component audit** (Prep)
  - [x] 0.1 Verify `apps/portal/src/components/ui/badge.tsx` exists; if missing, copy from `apps/community/src/components/ui/badge.tsx`. (**Confirmed present** — variants: default, secondary, accent, success, warning, info, destructive, outline, ghost. Supports `asChild`. No copy needed.)
  - [x] 0.2 Verify `apps/portal/src/components/ui/separator.tsx` exists; if missing, copy from community. (**Confirmed present** — Radix `Separator.Root`, supports `orientation`/`decorative`. No copy needed.)

- [x] **Task 1: DB schema, migration, journal** (AC: #1, #11)
  - [x] 1.1 Create `packages/db/src/schema/portal-seeker-profiles.ts`:
    - pgTable `portal_seeker_profiles` with columns per AC1.
    - Use `uniqueIndex("portal_seeker_profiles_user_id_unique").on(userId)` — enforces "one profile per user".
    - Export: `portalSeekerProfiles`, `type PortalSeekerProfile = ... .$inferSelect`, `type NewPortalSeekerProfile = ... .$inferInsert`, and TypeScript interfaces `SeekerExperience` and `SeekerEducation` mirroring the JSONB shape.
    - `import "server-only";`
  - [x] 1.2 Hand-write `packages/db/src/migrations/0059_portal_seeker_profiles.sql`:
    ```sql
    CREATE TABLE portal_seeker_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      headline varchar(200) NOT NULL,
      summary text,
      skills text[] NOT NULL DEFAULT '{}',
      experience_json jsonb NOT NULL DEFAULT '[]',
      education_json jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX portal_seeker_profiles_user_id_unique
      ON portal_seeker_profiles (user_id);
    ```
    **DO NOT use drizzle-kit generate** — it fails with `server-only` error (see Dev Notes). Hand-write only.
  - [x] 1.3 Append a new entry to `packages/db/src/migrations/meta/_journal.json`:
    ```json
    {
      "idx": 59,
      "version": "7",
      "when": 1708000059000,
      "tag": "0059_portal_seeker_profiles",
      "breakpoints": true
    }
    ```
    Without this entry drizzle-kit never applies the SQL file.
  - [x] 1.4 Wire schema into `packages/db/src/index.ts`: `import * as portalSeekerProfilesSchema from "./schema/portal-seeker-profiles";` and spread into `schemaMap`.
  - [x] 1.5 Run `pnpm --filter @igbo/db build` and verify the dist emits the new schema.

- [x] **Task 2: Query layer** (AC: #7)
  - [x] 2.1 Create `packages/db/src/queries/portal-seeker-profiles.ts` exporting:
    - `createSeekerProfile(data: NewPortalSeekerProfile): Promise<PortalSeekerProfile>`
    - `getSeekerProfileByUserId(userId: string): Promise<PortalSeekerProfile | null>`
    - `getSeekerProfileById(id: string): Promise<PortalSeekerProfile | null>`
    - `updateSeekerProfile(id: string, patch: Partial<NewPortalSeekerProfile>): Promise<PortalSeekerProfile | null>` (always bump `updatedAt: new Date()`)
    - `import "server-only";`
  - [x] 2.2 Tests: `portal-seeker-profiles.test.ts` (co-located, `@vitest-environment node`) — at least 10 tests:
    - create returns row with defaults for skills/experience/education
    - create throws on duplicate userId (unique constraint)
    - getSeekerProfileByUserId returns null when missing
    - getSeekerProfileByUserId returns row when present
    - getSeekerProfileById returns null / row
    - updateSeekerProfile bumps updatedAt
    - updateSeekerProfile is partial (only provided fields change)
    - updateSeekerProfile returns null for non-existent id
    - JSONB fields round-trip correctly (experience/education arrays)
    - Skills array round-trips (postgres text[])

- [x] **Task 3: Extend cross-app queries** (AC: #3, #5, #7)
  - [x] 3.1 **`packages/db/src/queries/cross-app.ts` already exists — do NOT overwrite. APPEND only.** Existing exports (do not touch): `getCommunityVerificationStatus`, `getMembershipDuration`, `getUserEngagementLevel`, `getCommunityTrustSignals`, `getReferralChain`, interface `CommunityTrustSignals`.
  - [x] 3.2 Append:
    ```typescript
    export async function getCommunityProfileForPrefill(userId: string): Promise<{
      displayName: string | null;
      bio: string | null;
    }> {
      const [profile] = await db
        .select({
          displayName: communityProfiles.displayName,
          bio: communityProfiles.bio,
        })
        .from(communityProfiles)
        .where(eq(communityProfiles.userId, userId))
        .limit(1);
      return {
        displayName: profile?.displayName ?? null,
        bio: profile?.bio ?? null,
      };
    }

    export interface SeekerTrustSignals {
      isVerified: boolean;
      badgeType: string | null;
      memberSince: Date | null;
      memberDurationDays: number;
      communityPoints: number;
      engagementLevel: "low" | "medium" | "high";
      displayName: string | null;
    }

    export async function getSeekerTrustSignals(
      userId: string,
    ): Promise<SeekerTrustSignals | null> {
      const [user] = await db
        .select({ createdAt: authUsers.createdAt })
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .limit(1);
      if (!user) return null;

      const [profile, verification, engagement] = await Promise.all([
        db
          .select({ displayName: communityProfiles.displayName })
          .from(communityProfiles)
          .where(eq(communityProfiles.userId, userId))
          .limit(1)
          .then(([p]) => p ?? null),
        getCommunityVerificationStatus(userId),
        getUserEngagementLevel(userId),
      ]);

      const durationMs = Date.now() - user.createdAt.getTime();
      const memberDurationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

      // getCommunityVerificationStatus may return null for users with no verification record
      const safeVerif = verification ?? { isVerified: false, badgeType: null, verifiedAt: null };

      return {
        isVerified: safeVerif.isVerified,
        badgeType: safeVerif.badgeType,
        memberSince: user.createdAt,
        memberDurationDays,
        communityPoints: engagement.score,
        engagementLevel: engagement.level as "low" | "medium" | "high",
        displayName: profile?.displayName ?? null,
      };
    }
    ```
    Note: `bio` exists in `community_profiles` schema — select it as `communityProfiles.bio`. Also verify `authUsers` is imported in `cross-app.ts` (the `getSeekerTrustSignals` function queries it directly); add `import { authUsers } from "../schema/auth-users"` (or the existing barrel import path in the file) if not already present. Do NOT add a new import if `authUsers` is already used by another function in the file (e.g., `getMembershipDuration`).
  - [x] 3.3 Extend `cross-app.test.ts` — **append only, do not rewrite existing tests**:
    - `getCommunityProfileForPrefill` returns `{ displayName, bio }` when community profile exists
    - Returns `{ null, null }` when no community profile
    - `getSeekerTrustSignals` returns null when user missing
    - Returns full shape when user + badge + points exist
    - `memberDurationDays` is non-negative and approximately `floor((now - createdAt)/day)`
    - `communityPoints` reflects `getUserEngagementLevel.score`
    - `badgeType` is `"blue"` when user has a blue badge, `null` when no badge

- [x] **Task 4: Zod validation schema** (AC: #8)
  - [x] 4.1 Create `apps/portal/src/lib/validations/seeker-profile.ts`:
    ```typescript
    import { z } from "zod/v4";

    const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
    const PRESENT = "Present" as const;

    export const experienceEntrySchema = z.object({
      title: z.string().min(1).max(200),
      company: z.string().min(1).max(200),
      startDate: z.string().regex(YEAR_MONTH, "Use YYYY-MM format"),
      endDate: z.union([z.string().regex(YEAR_MONTH), z.literal(PRESENT)]),
      description: z.string().max(2000).optional(),
    });

    export const educationEntrySchema = z.object({
      institution: z.string().min(1).max(200),
      degree: z.string().min(1).max(100),
      field: z.string().min(1).max(100),
      graduationYear: z.number().int().min(1950).max(new Date().getFullYear() + 7),
    });

    export const seekerProfileSchema = z.object({
      headline: z.string().min(1, "Headline is required").max(200),
      summary: z.string().max(5000).optional(),
      skills: z.array(z.string().min(1).max(50)).max(30).default([]),
      experience: z.array(experienceEntrySchema).max(20).default([]),
      education: z.array(educationEntrySchema).max(10).default([]),
    });

    export type SeekerProfileInput = z.infer<typeof seekerProfileSchema>;
    export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
    export type EducationEntry = z.infer<typeof educationEntrySchema>;
    ```
  - [x] 4.2 Tests `seeker-profile-validation.test.ts` (8+):
    - Valid minimal (headline only) passes, defaults for arrays
    - Empty headline fails
    - Headline > 200 fails
    - Skills array > 30 fails
    - Skill string > 50 fails
    - Experience `startDate` not YYYY-MM fails
    - Experience `endDate` accepts "Present"
    - Education `graduationYear` out of range fails

- [x] **Task 5: Portal error codes & constants** (AC: #11)
  - [x] 5.1 Add `DUPLICATE_SEEKER_PROFILE: "PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE"` to `apps/portal/src/lib/portal-errors.ts`.
  - [x] 5.2 Extend (or create, if not present) `portal-errors.test.ts` with a single assertion verifying the new constant: `expect(PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE).toBe("PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE")`.

- [x] **Task 6: API routes** (AC: #6, #11)
  - [x] 6.1 **Depends on Tasks 1, 2, 3, 4, 5.**
  - [x] 6.2 `apps/portal/src/app/api/v1/seekers/route.ts`:
    - `POST` — `requireJobSeekerRole()`, parse body with `seekerProfileSchema`, check `getSeekerProfileByUserId(session.user.id)` → if exists throw `ApiError({ title: "Seeker profile already exists", status: 409, extensions: { code: PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE } })`; else `createSeekerProfile({ userId, headline, summary, skills, experienceJson: experience, educationJson: education })`; return `successResponse(profile, undefined, 201)`.
    - Wrapped with portal `withApiHandler()`.
  - [x] 6.3 `apps/portal/src/app/api/v1/seekers/me/route.ts`:
    - `GET` — `requireJobSeekerRole()`; fetch via `getSeekerProfileByUserId`; return `successResponse(profile ?? null)` (null is valid).
  - [x] 6.4 `apps/portal/src/app/api/v1/seekers/[seekerProfileId]/route.ts`:
    - `GET` — Extract `seekerProfileId` via `new URL(req.url).pathname.split("/").at(-1)` (per portal convention; `withApiHandler` does not pass Next params). `auth()` from `@igbo/auth`; if no session or `activePortalRole` not in `{"EMPLOYER","JOB_ADMIN"}` throw `new ApiError({ title: "Forbidden", status: 403, extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH } })`; fetch profile via `getSeekerProfileById`; if !profile throw `new ApiError({ title: "Not found", status: 404, extensions: { code: PORTAL_ERRORS.NOT_FOUND } })`; fetch `getSeekerTrustSignals(profile.userId)`; return `successResponse({ ...profile, trustSignals })`.
    - `PATCH` — Extract id from URL. `requireJobSeekerRole()`. Fetch profile. If not found throw 404. Owner check: `profile.userId === session.user.id`, else 403. Parse body with `seekerProfileSchema.partial()`. Update via `updateSeekerProfile(id, patch)`. Return `successResponse(updated)`.
  - [x] 6.5 Tests — three test files (one per route file), at least 18 tests total:
    - `seekers-route.test.ts` — POST: 201 creates; 409 duplicate; 403 non-seeker; 400 invalid body; 401 unauth.
    - `seekers-me-route.test.ts` — GET: returns own profile; returns null; 403 non-seeker.
    - `seekers-id-route.test.ts` — GET: employer sees profile+trust; admin sees profile+trust; seeker gets 403; unauthenticated gets 401; 404 missing. PATCH: owner updates; non-owner 403; non-seeker 403; partial update; 404 missing; updatedAt bumps; invalid body 400 via `ApiError`.

- [x] **Task 7: UI — `SeekerProfileForm` (flow component)** (AC: #2, #4, #9, #10)
  - [x] 7.1 Create `apps/portal/src/components/flow/seeker-profile-form.tsx` — Client Component. (`components/flow/` is a new directory that does not yet exist in the portal — create it.)
  - [x] 7.2 Props: `mode: "create" | "edit"`, `initialData?: PortalSeekerProfile`, `prefill?: { displayName: string | null; bio: string | null }`, `onSuccess?: (profile) => void`.
  - [x] 7.3 State: headline, summary, skills (string[]), experience (array), education (array).
    - In create mode: initialize `headline` from `prefill.displayName ?? ""`, `summary` from `prefill.bio ?? ""`. Render a dismissible pre-fill banner `Portal.seeker.prefilledBanner` when any prefill value was applied.
    - In edit mode: initialize from `initialData` (transform JSONB fields back to typed arrays).
  - [x] 7.4 Fields:
    - **Headline**: `<Input>`
    - **Summary**: `<Textarea>` with character counter (`aria-live="polite"`)
    - **Skills**: Custom tag input (hidden text field `<input>` + chip list). Enter or comma commits a tag. Backspace on empty input removes the last. Delete button per chip with aria-label.
    - **Experience**: Repeatable row component `<ExperienceRow>` with `role="group"`, remove button, date inputs (YYYY-MM `<input type="month">`), "Present" checkbox that sets endDate. Focus moves to new row's title on add.
    - **Education**: Same pattern.
  - [x] 7.5 On submit: client-side `seekerProfileSchema.safeParse(state)`; if errors, set fieldErrors + focus first error; else POST (create) / PATCH (edit) to `/api/v1/seekers` or `/api/v1/seekers/{id}`.
  - [x] 7.6 On success: sonner `toast.success(t("successCreated"|"successUpdated"))`, call `onSuccess`, `router.replace("/profile")` (strips `?edit=true`).
  - [x] 7.7 On 409: `toast.error(t("errorDuplicate"))`. On other errors: `toast.error(t("errorGeneric"))`.
  - [x] 7.8 Export `SeekerProfileFormSkeleton` from the same file (architecture convention).
  - [x] 7.9 Tests `seeker-profile-form.test.tsx` (12+):
    - Renders all fields in create mode with empty initial values
    - Pre-fill banner appears and inputs reflect prefill values
    - Edit mode pre-populates from `initialData`
    - Empty headline shows error on submit, focus moves to headline
    - Add skill via Enter appends chip; Backspace removes
    - Skills cap at 30 — 31st add is rejected
    - Add experience row — focus moves to new row's title input
    - Remove experience row — focus moves to next row's title or add button
    - Successful create POSTs correct payload and shows success toast
    - Successful update PATCHes correct payload
    - 409 shows duplicate toast
    - axe-core accessibility assertion (no violations)
    - **Mocks**: `fetch` global; `next-intl` `useTranslations`; `sonner` `toast`; `next/navigation` `useRouter` (replace + push)

- [x] **Task 8: UI — `SeekerProfileView` (domain component)** (AC: #4, #9, #10)
  - [x] 8.1 Create `apps/portal/src/components/domain/seeker-profile-view.tsx` — Server Component (no client interactivity beyond the Edit button link).
  - [x] 8.2 Props: `profile: PortalSeekerProfile`, `editable: boolean` (true when viewed by the owner).
  - [x] 8.3 Renders: headline `<h1>`, summary `<p style={{ whiteSpace: "pre-wrap" }}>`, Skills section with `<Badge>` chips, Experience list (title • company • date range • description), Education list (institution • degree • field • year). If `editable`, renders an `<Link href="/profile?edit=true">` styled as a button.
  - [x] 8.4 Tests `seeker-profile-view.test.tsx` (6+):
    - Renders all sections with data
    - Renders "no skills" empty state when skills empty
    - Renders "no experience" empty state when experience empty
    - Edit link appears when `editable=true`
    - Edit link hidden when `editable=false`
    - axe-core accessibility assertion

- [x] **Task 9: UI — `TrustSignalsPanel` (semantic component)** (AC: #5, #9, #10)
  - [x] 9.1 Create `apps/portal/src/components/semantic/trust-signals-panel.tsx`.
  - [x] 9.2 Props: `signals: SeekerTrustSignals`.
  - [x] 9.3 Renders:
    - `<section aria-labelledby="trust-heading">` with visually-meaningful heading (`t("trustSection")`)
    - Verification row — **do NOT pass `SeekerTrustSignals` directly to `<TrustBadge>`** (`TrustBadge` expects `CommunityTrustSignals`, a different type). Two options: (a) adapt the prop: `<TrustBadge trustSignals={{ isVerified: signals.isVerified, memberSince: signals.memberSince, displayName: signals.displayName, engagementLevel: signals.engagementLevel }} />`, or (b) inline the verification row using the same ShieldCheck icon and color classes from `trust-badge.tsx` without calling the component. Option (b) is simpler.
    - Badge-type pill (color-coded blue/red/purple, with i18n labels `Portal.trust.badgeBlue|badgeRed|badgePurple`). **Render only when `signals.badgeType !== null`.**
    - Member-since line using existing `Portal.trust.memberSince` key — **extract year from the Date**: `t("memberSince", { year: signals.memberSince ? new Date(signals.memberSince).getFullYear() : "—" })`. The key expects `{year}`, not a Date object.
    - Community points line using new `Portal.trust.communityPoints`
    - Engagement level pill (reuse existing `engagementHigh|Medium|Low` keys and colors from `trust-badge.tsx`)
  - [x] 9.4 Export `TrustSignalsPanelSkeleton`.
  - [x] 9.5 Tests `trust-signals-panel.test.tsx` (6+):
    - Renders verification when `isVerified=true`
    - Omits badge pill when `badgeType=null`
    - Renders each badge type with correct label (blue/red/purple)
    - Renders community points count
    - Renders engagement pill with correct color class
    - axe-core accessibility assertion

- [x] **Task 10: Pages** (AC: #2, #4, #5, #12)
  - [x] 10.1 Create `apps/portal/src/app/[locale]/(gated)/profile/page.tsx` — Server Component:
    - Params: `{ params: Promise<{ locale: string }>, searchParams: Promise<{ edit?: string }> }`
    - `const session = await auth();` — if not authenticated, redirect to signin (inherited from layout but check).
    - If `session.user.activePortalRole !== "JOB_SEEKER"` → `redirect("/")`.
    - Fetch `const profile = await getSeekerProfileByUserId(session.user.id)`.
    - If no profile → fetch `prefill = await getCommunityProfileForPrefill(session.user.id)`; render `<SeekerProfileForm mode="create" prefill={prefill} />`.
    - If profile exists and `searchParams.edit === "true"` → render `<SeekerProfileForm mode="edit" initialData={profile} />`.
    - Else → render `<SeekerProfileView profile={profile} editable />`.
  - [x] 10.2 Create `apps/portal/src/app/[locale]/(gated)/seekers/[seekerProfileId]/page.tsx` — Server Component:
    - `const session = await auth();` — require session.
    - If `activePortalRole` not in `{"EMPLOYER","JOB_ADMIN"}` → `notFound()`.
    - Fetch profile via `getSeekerProfileById(seekerProfileId)`. If null → `notFound()`.
    - Fetch `getSeekerTrustSignals(profile.userId)`.
    - Render `<SeekerProfileView profile={profile} editable={false} />` + `<TrustSignalsPanel signals={signals} />`.
  - [x] 10.3 Tests:
    - `profile/page.test.tsx` (6+): renders create form (no profile), renders view mode (profile + no edit param), renders edit form (profile + edit=true), redirects non-seeker, passes prefill to form in create mode, uses session user id.
    - `seekers/[seekerProfileId]/page.test.tsx` (6+): employer sees view + trust panel, admin sees view + trust panel, seeker → notFound, unauth → notFound or redirect, missing profile → notFound, passes correct props.

- [x] **Task 11: i18n** (AC: #10)
  - [x] 11.1 Add all keys listed in the i18n inventory above to `apps/portal/messages/en.json` under `Portal.seeker.*` and (new keys only) under `Portal.trust.*`.
  - [x] 11.2 At Dev Completion: add matching Igbo translations to `apps/portal/messages/ig.json`.
  - [x] 11.3 Run `pnpm --filter portal test` to confirm no missing-key warnings.

- [x] **Task 12: Regression verification**
  - [x] 12.1 Run `pnpm --filter @igbo/db test` — expect all existing passing plus new queries (target ~10 new).
  - [x] 12.2 Run `pnpm --filter portal test` — expect all existing 984 passing plus new tests (target ~60 new).
  - [x] 12.3 Run `pnpm --filter @igbo/db typecheck` and `pnpm --filter portal typecheck` — zero errors.
  - [x] 12.4 Run `pnpm ci-checks` locally — no new failures.
  - [x] 12.5 Run `pnpm --filter @igbo/db build` — ensure dist emits new schema + queries so portal type-check sees them.

## Dev Notes

### Critical patterns (from established project conventions — see MEMORY.md)

- **Migrations**: Hand-write SQL — drizzle-kit generate fails with `server-only` error. **Next migration index is 0059** (0058 was `portal_screening`).
- **Migration journal**: After writing the SQL file you **MUST** append the matching entry to `packages/db/src/migrations/meta/_journal.json` — without this drizzle-kit never applies the SQL file. Use `idx: 59`, `when: 1708000059000`.
- **Zod**: Import from `"zod/v4"` (portal convention). Validation errors in routes must use `throw new ApiError(...)` — `errorResponse()` only accepts a `ProblemDetails` object, NOT a string.
- **`withApiHandler` dynamic params**: Portal `withApiHandler` only passes `request`; Next.js route params are NOT forwarded. Extract params from URL: `new URL(req.url).pathname.split("/").at(-1)` for `[seekerProfileId]`.
- **API routes**: Always wrap with `withApiHandler()` from `@/lib/api-middleware`.
- **Role guards**: `requireJobSeekerRole()`, `requireEmployerRole()`, `requireJobAdminRole()` — from `@/lib/portal-permissions`.
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`.
- **DB schema imports**: No `src/db/schema/index.ts` — schemas imported directly in `packages/db/src/index.ts` with `import * as xSchema`.
- **Co-located tests**: Tests live next to source (not `__tests__`), `@vitest-environment node` for server files.
- **Portal test pattern**: Mock `useSession` directly via `vi.mock("next-auth/react")` — don't use real SessionProvider. `jest-axe` in **portal**: `expect.extend(toHaveNoViolations)` + `expect(results).toHaveNoViolations()` — **NO `@ts-expect-error`** (portal has `@types/jest-axe`). Radix Select: polyfill `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `scrollIntoView`.
- **Type sync**: Run `pnpm --filter @igbo/db build` before typechecking portal — portal imports from `@igbo/db` dist.

### Source tree components to touch

```
packages/db/src/
├── schema/portal-seeker-profiles.ts                           # NEW
├── migrations/0059_portal_seeker_profiles.sql                  # NEW
├── migrations/meta/_journal.json                               # MODIFIED (append idx 59)
├── queries/portal-seeker-profiles.ts                          # NEW
├── queries/portal-seeker-profiles.test.ts                     # NEW
├── queries/cross-app.ts                                       # MODIFIED (append 2 functions)
├── queries/cross-app.test.ts                                  # MODIFIED (append tests)
└── index.ts                                                   # MODIFIED (spread portal-seeker schema)

apps/portal/src/
├── lib/
│   ├── portal-errors.ts                                       # MODIFIED (+ DUPLICATE_SEEKER_PROFILE)
│   ├── portal-errors.test.ts                                  # MODIFIED
│   └── validations/seeker-profile.ts                          # NEW
├── lib/validations/seeker-profile.test.ts                     # NEW
├── app/api/v1/seekers/
│   ├── route.ts                                               # NEW (POST)
│   ├── route.test.ts                                          # NEW
│   ├── me/route.ts                                            # NEW (GET)
│   ├── me/route.test.ts                                       # NEW
│   ├── [seekerProfileId]/route.ts                             # NEW (GET public, PATCH)
│   └── [seekerProfileId]/route.test.ts                        # NEW
├── app/[locale]/(gated)/profile/
│   ├── page.tsx                                               # NEW
│   └── page.test.tsx                                          # NEW
├── app/[locale]/(gated)/seekers/[seekerProfileId]/
│   ├── page.tsx                                               # NEW
│   └── page.test.tsx                                          # NEW
├── components/flow/
│   ├── seeker-profile-form.tsx                                # NEW (+ skeleton)
│   └── seeker-profile-form.test.tsx                           # NEW
├── components/domain/
│   ├── seeker-profile-view.tsx                                # NEW
│   └── seeker-profile-view.test.tsx                           # NEW
├── components/semantic/
│   ├── trust-signals-panel.tsx                                # NEW (+ skeleton)
│   └── trust-signals-panel.test.tsx                           # NEW
├── components/ui/badge.tsx                                    # MAYBE (Task 0.1)
├── components/ui/separator.tsx                                # MAYBE (Task 0.2)
├── messages/en.json                                           # MODIFIED (+ Portal.seeker.*, trust keys)
└── messages/ig.json                                           # MODIFIED at Dev Completion
```

### Testing standards summary

- Unit tests: co-located, `@vitest-environment node` for server code.
- Component tests: React Testing Library + `@testing-library/user-event` (use `userEvent.setup()`, not `fireEvent`, for Radix / interactive widgets).
- **`<input type="month">` in jsdom**: jsdom does not implement the browser month-picker UI — the input behaves as a plain text field. In tests, set values directly: `await userEvent.type(input, "2023-01")` or `fireEvent.change(input, { target: { value: "2023-01" } })`. Do not attempt to interact with a picker widget.
- Route tests: mock `requireJobSeekerRole()`/`auth()`, mock `@igbo/db/queries/*`, mock `@igbo/db/queries/cross-app` for trust signals.
- Accessibility: include at least one `axe-core` assertion per component test file.
- Page tests: render the async server component and assert rendered HTML structure (existing portal pattern — see `company-profile/page.test.tsx`).
- Regression gates: `pnpm --filter portal test` and `pnpm --filter @igbo/db test` both green; no new warnings.

### Integration Tests (SN-3 — Missing Middle)

- **Real DB query integration (@igbo/db test suite):** `createSeekerProfile` → `getSeekerProfileByUserId` round-trip using a real database connection (not mocks) to verify the UNIQUE constraint on `user_id` actually fires a duplicate-key error, and to verify JSONB serialization of experience/education arrays.
- **Cross-app trust-signal wiring:** `getSeekerTrustSignals` executed against a real `auth_users` + `community_user_badges` + `platform_points_ledger` seed to verify the composed shape (all three tables join correctly).
- **Route → service → DB chain:** A route test that uses the real `withApiHandler` (not a bypass mock) and mocked DB layer to verify CSRF + ApiError catch + trace header propagation still work for the new `/api/v1/seekers/*` routes (per P-1.2 Task 1.4 pattern).
- **Page → form → API loop (portal test suite):** Render `profile/page.tsx` with a mocked session and `getSeekerProfileByUserId` returning null; verify `<SeekerProfileForm>` renders with `prefill` values from mocked `getCommunityProfileForPrefill`.

### Project Structure Notes

- New routes live under `apps/portal/src/app/[locale]/(gated)/` — the gated group provides auth + role hydration automatically (established in PREP-D).
- The seeker self-service page is at `/profile` (not `/seeker/profile` or `/portal/profile`) — file lives at `apps/portal/src/app/[locale]/(gated)/profile/page.tsx`. The `(gated)` route group does not add a URL segment.
- Public seeker view is at `/seekers/[seekerProfileId]` (plural) to avoid namespace collision with the owner's `/profile` route.
- Community `bio` column exists on `community_profiles` table — confirm field is selected in the prefill query (verify in `packages/db/src/schema/community-profiles.ts`).

### Previous story intelligence

Reference stories and the patterns to reuse verbatim:

- **P-1.2 (Company Profile Creation)** — closest analog: Zod schema → route (POST/GET/PATCH) → form (create/edit mode via `?edit=true`) → view → public page with trust signals. **Copy the overall skeleton.** Notable lessons:
  - Use `successResponse(profile ?? null)` for the "me" endpoint — don't 404 on absence.
  - Owner check on PATCH is server-side only (`profile.userId === session.user.id`).
  - Cross-app queries are extended by appending (never rewriting) `cross-app.ts`.
  - Portal error code must be added to `portal-errors.ts` before the route throws it.
  - `TrustBadge` semantic component already exists — compose into `TrustSignalsPanel`, don't duplicate.
- **PREP-D (Choose Your Path)** — established the `(gated)` layout group and `useActivePortalRole` hook. Do not re-implement auth gates; the layout handles them.
- **P-3.3 (Screening keywords)** — pattern for appending a new migration and journal entry (idx 58 → 59). Schema wiring into `packages/db/src/index.ts`. UI pattern for `KeywordManager` tag-input style input (informative reference for the skills tag input).
- **Radix gotchas** — jsdom does not implement `hasPointerCapture` / `scrollIntoView` — existing portal tests apply polyfills at top of test files. Apply the same polyfill if Radix Select is used anywhere (Task 7 probably does not need it — skills tag input is plain `<input>`, experience uses `<input type="month">`).

### Endorsement count — known gap (deferred)

The epic text mentions "endorsement count" as a trust signal. The community platform does **not** currently have an endorsement system. For this story, **omit endorsement count**; `getSeekerTrustSignals` does not return it. When community endorsements ship (future epic), extend the wrapper and add a UI row to `TrustSignalsPanel` via a follow-up story. This is tracked as an implicit P-2.x backlog item — do NOT stub a "0 endorsements" line in the UI (risk of looking broken).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: Seeker Profile Creation & Community Trust Data] — user story + full AC set
- [Source: _bmad-output/planning-artifacts/architecture.md#2290-2373] — portal source tree; `/profile/page.tsx` placement
- [Source: _bmad-output/implementation-artifacts/p-1-2-company-profile-creation-management.md] — closest implementation analog (Zod → route → form → view → public page w/ trust)
- [Source: _bmad-output/implementation-artifacts/p-1-1a-portal-schema-foundation-role-model.md] — portal role model (`activePortalRole`)
- [Source: packages/db/src/queries/cross-app.ts] — existing trust signal functions (do not rewrite)
- [Source: apps/portal/src/components/semantic/trust-badge.tsx] — reuse pattern for trust panel
- [Source: apps/portal/src/lib/portal-permissions.ts] — `requireJobSeekerRole()` already exists
- [Source: apps/portal/src/lib/portal-errors.ts] — add `DUPLICATE_SEEKER_PROFILE`
- [Source: packages/db/src/schema/portal-company-profiles.ts] — schema pattern template
- [Source: packages/db/src/schema/community-profiles.ts] — source of `bio` / `displayName` for pre-fill

## Definition of Done (SN-1)

- [x] All acceptance criteria met
- [x] All validation scenarios demonstrated with evidence
- [x] Unit tests written and passing (target: ~60 new portal tests + ~15 new @igbo/db tests)
- [x] Integration tests written and passing (SN-3)
- [x] Flow owner has verified the complete end-to-end chain
- [x] No pre-existing test regressions introduced
- [x] Dev Completion: all i18n keys in Readiness inventory exist in `en.json` with English copy and render without missing-key warnings
- [x] Dev Completion: **Igbo translations added to `ig.json` for every key in the Readiness inventory** (deferred from SN-5 per i18n gate split)
- [x] Dev Completion: every sanitization point passes `pnpm ci-checks` locally
- [x] Dev Completion: all a11y patterns listed in Readiness (including focus management) have passing axe-core assertions
- [x] Dev Completion: all component dependencies in Readiness are imported and rendering

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Validation Evidence

All 12 tasks implemented. Tests: 794/794 @igbo/db (up from 772), 1074/1074 portal (up from 984, +90 new). Zero typecheck errors. `pnpm ci-checks` passes clean.

- AC1 ✅ migration 0059_portal_seeker_profiles.sql + journal idx 59 + Drizzle schema wired into packages/db/src/index.ts
- AC2 ✅ SeekerProfileForm create/edit, POST /api/v1/seekers, skills tag input, experience/education repeatable rows
- AC3 ✅ getCommunityProfileForPrefill appended to cross-app.ts; page server-fetches prefill and passes to form
- AC4 ✅ SeekerProfileView with Edit link when editable=true; PATCH /api/v1/seekers/[id] with owner check
- AC5 ✅ /seekers/[seekerProfileId] page + TrustSignalsPanel rendering all 5 trust fields; EMPLOYER/JOB_ADMIN only
- AC6 ✅ POST /api/v1/seekers (201/409), GET /api/v1/seekers/me, GET+PATCH /api/v1/seekers/[id]
- AC7 ✅ portal-seeker-profiles.ts queries + cross-app.ts extended with getCommunityProfileForPrefill + getSeekerTrustSignals
- AC8 ✅ seeker-profile.ts Zod schema (zod/v4) with all rules per AC8
- AC9 ✅ axe-core passes on SeekerProfileForm, SeekerProfileView, TrustSignalsPanel, both pages; aria-labelledby on sections
- AC10 ✅ 47 Portal.seeker.* keys + 4 new Portal.trust.* keys added to en.json and ig.json
- AC11 ✅ PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE + DB UNIQUE constraint + pre-check in POST route
- AC12 ✅ profile page gated under (gated) layout, JOB_SEEKER role check redirects non-seekers

### Debug Log References

- Fixed pre-existing TS typing issue in screening keywords route tests: `db.transaction` mock callback typed with `any` after new schema widened the transaction type.

### Completion Notes List

- `TrustSignalsPanel` inlines trust rendering (does not call `TrustBadge` directly — different prop types); follows same color-class pattern from trust-badge.tsx
- `SeekerProfileView` is a **Server Component** (async, uses `getTranslations` + `@/i18n/navigation` Link) — corrected in code review.
- Both screening keyword test files updated: `(cb: any)` cast for `db.transaction` mock (type widens with each new schema added to the DB map — this is structural, not a bug)
- Next migration: `0060`

### Code Review Fixes (2026-04-08)

All HIGH and MEDIUM issues from adversarial code review fixed:

- **H1 (hardcoded "in")** — Added `Portal.seeker.educationInField` ICU key (`"{degree} in {field}"` / `"{degree} na {field}"`) to both `en.json` and `ig.json`; replaced literal `"in"` in `seeker-profile-view.tsx:92` with `t("educationInField", { degree, field })`.
- **H2 (duplicate GET endpoint)** — Removed the extra `GET /api/v1/seekers` handler from `apps/portal/src/app/api/v1/seekers/route.ts` (duplicate of `/api/v1/seekers/me`, not in AC6). Updated `route.test.ts` to drop the 3 GET tests (coverage remains in `me/route.test.ts`).
- **M1 + M2 (server component + locale-prefixed Link)** — Converted `SeekerProfileView` from client to async Server Component; switched `useTranslations` → `await getTranslations(...)`; switched `import Link from "next/link"` → `import { Link } from "@/i18n/navigation"` with object `{ pathname, query }` href. Test file now awaits `SeekerProfileView(props)` and mocks `next-intl/server` + `@/i18n/navigation`.
- **M3 (cancel navigation)** — `SeekerProfileForm` cancel button now routes to `/` in create mode and `/profile` in edit mode (was unconditionally `/profile`).
- **M4 (skill length & dedup)** — `commitSkill` now rejects skills >50 chars (with `skillTooLong` error) and case-insensitive duplicates (with `skillDuplicate` error) before commit.
- **M5 (dedicated cap error)** — Added dedicated `skillsCapReached` / `skillTooLong` / `skillDuplicate` keys in both locales; replaced error-label reuse of `skillsHelp` with `errors.skills` state.

**Tests after fixes:** portal 1076/1076 (↑ from 1074: −3 old GET tests, +5 new — skillTooLong, skillDuplicate, cancel-create, cancel-edit, educationInField i18n). @igbo/db unchanged 794/794. Typecheck clean. `pnpm ci-checks` passes.

### File List

**packages/db/src/**
- `schema/portal-seeker-profiles.ts` — NEW
- `migrations/0059_portal_seeker_profiles.sql` — NEW
- `migrations/meta/_journal.json` — MODIFIED (idx 59)
- `queries/portal-seeker-profiles.ts` — NEW
- `queries/portal-seeker-profiles.test.ts` — NEW
- `queries/cross-app.ts` — MODIFIED (appended getCommunityProfileForPrefill, SeekerTrustSignals, getSeekerTrustSignals)
- `queries/cross-app.test.ts` — MODIFIED (appended 7 tests)
- `index.ts` — MODIFIED (spread portalSeekerProfilesSchema)

**apps/portal/src/**
- `lib/portal-errors.ts` — MODIFIED (+DUPLICATE_SEEKER_PROFILE)
- `lib/portal-errors.test.ts` — MODIFIED (count 10→11, new assertion)
- `lib/validations/seeker-profile.ts` — NEW
- `lib/validations/seeker-profile.test.ts` — NEW
- `app/api/v1/seekers/route.ts` — NEW (POST)
- `app/api/v1/seekers/route.test.ts` — NEW
- `app/api/v1/seekers/me/route.ts` — NEW (GET)
- `app/api/v1/seekers/me/route.test.ts` — NEW
- `app/api/v1/seekers/[seekerProfileId]/route.ts` — NEW (GET public, PATCH owner)
- `app/api/v1/seekers/[seekerProfileId]/route.test.ts` — NEW
- `app/[locale]/(gated)/profile/page.tsx` — NEW
- `app/[locale]/(gated)/profile/page.test.tsx` — NEW
- `app/[locale]/(gated)/seekers/[seekerProfileId]/page.tsx` — NEW
- `app/[locale]/(gated)/seekers/[seekerProfileId]/page.test.tsx` — NEW
- `components/flow/seeker-profile-form.tsx` — NEW (+SeekerProfileFormSkeleton)
- `components/flow/seeker-profile-form.test.tsx` — NEW
- `components/domain/seeker-profile-view.tsx` — NEW
- `components/domain/seeker-profile-view.test.tsx` — NEW
- `components/semantic/trust-signals-panel.tsx` — NEW (+TrustSignalsPanelSkeleton)
- `components/semantic/trust-signals-panel.test.tsx` — NEW
- `messages/en.json` — MODIFIED (+Portal.seeker.* 47 keys, +Portal.trust.* 4 new keys)
- `messages/ig.json` — MODIFIED (same)
- `app/api/v1/admin/screening/keywords/route.test.ts` — MODIFIED (db.transaction mock cast)
- `app/api/v1/admin/screening/keywords/[keywordId]/route.test.ts` — MODIFIED (same)
