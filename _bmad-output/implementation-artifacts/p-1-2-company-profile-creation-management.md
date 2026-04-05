# Story P-1.2: Company Profile Creation & Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an employer,
I want to create and manage a company profile with logo, description, industry, size, and culture information,
so that job seekers can learn about my company and see trust signals from the community platform.

## Acceptance Criteria

1. **AC1 — Company profile creation form** — An authenticated user with the EMPLOYER role who navigates to `/company-profile` sees a form with fields: company name (required, max 200 chars), logo upload (image, reusing `platformFileUploads` infrastructure), description (textarea, optional), industry (select from predefined list), company size (select: 1-10, 11-50, 51-200, 201-500, 500+), and culture info (textarea, optional). Submitting a valid form creates a `portal_company_profiles` record linked to the authenticated user.
2. **AC2 — Company profile editing** — An employer who already has a company profile sees their existing profile at `/company-profile` with an "Edit" option. They can update any field and save changes. The `updated_at` timestamp refreshes on save. A success toast confirms the save.
3. **AC3 — Company profile public view with trust signals** — A job seeker (or any user) who views a company profile at `/companies/[companyId]` sees the company information, logo, and community trust signals: verification badge (if verified), membership duration, and community engagement level. Trust signals are fetched from community data via cross-app queries in `@igbo/db`.
4. **AC4 — Active job listings on profile** — The public company profile page lists all active job postings by this company. (Note: this AC is a stub until P-1.3A+ when job postings exist — render an empty state with "No job postings yet" for now.)
5. **AC5 — Company profile gate** — An employer who has not yet created a company profile and attempts to navigate to job-posting-related pages (e.g., `/my-jobs`, `/jobs/new`) is redirected to `/company-profile` with a toast message explaining they must create a company profile first.
6. **AC6 — Logo upload via platform infrastructure** — Logo upload uses the `platformFileUploads` pipeline. A portal upload API route at `/api/v1/upload/file` handles image uploads, writes to `platformFileUploads` via `@igbo/db`, and returns a URL. The `LogoUpload` component displays a preview and progress indicator.
7. **AC7 — Portal API infrastructure** — All portal API routes use a `withApiHandler()` middleware (portal-local version) with CSRF validation, error handling via RFC 7807 (`ApiError` from `@igbo/auth/api-error`), trace ID headers, and Cache-Control. `successResponse()` and `errorResponse()` utilities follow the same contract as community.
8. **AC8 — One company profile per employer** — Each employer can have at most one company profile. Attempting to create a second profile returns a 409 Conflict error.
9. **AC9 — i18n complete** — All company profile UI strings use `Portal.company.*` i18n keys in both EN and IG.
10. **AC10 — Accessibility** — All form inputs have proper labels, error messages are associated via `aria-describedby`, and axe-core assertions pass on all new components.

## Validation Scenarios (SN-2 — REQUIRED)

1. **Employer creates company profile** — Log in as EMPLOYER with no existing profile. Navigate to `/company-profile`. Fill out name, industry, size. Submit.
   - Expected outcome: Profile is created. Success toast shown. Page transitions to view mode showing the saved profile.
   - Evidence required: Screenshot of form + toast + saved profile view

2. **Employer edits existing profile** — From the profile view, click Edit. Change the company name and description. Save.
   - Expected outcome: Profile updates successfully. `updated_at` changes. Toast confirms save.
   - Evidence required: Screenshot of edit form + updated values

3. **Employer uploads company logo** — During profile creation/edit, upload an image file.
   - Expected outcome: Image uploads with progress indicator. Preview shown after upload. Logo persists after save.
   - Evidence required: Screenshot of upload progress + preview + saved profile with logo

4. **Seeker views company profile with trust signals** — As a JOB_SEEKER, navigate to `/companies/[companyId]`.
   - Expected outcome: Company info displayed. Trust signals section shows community verification status, membership duration, engagement level.
   - Evidence required: Screenshot of public company profile page

5. **Company profile gate redirects** — As an EMPLOYER with no profile, navigate to `/my-jobs`.
   - Expected outcome: Redirected to `/company-profile` with toast: "Create your company profile first"
   - Evidence required: Screenshot of redirect + toast message

6. **Duplicate profile prevention** — Attempt to POST to `/api/v1/companies` when profile already exists.
   - Expected outcome: 409 Conflict response with appropriate error message
   - Evidence required: API response showing 409

7. **Non-employer cannot access** — As a JOB_SEEKER, attempt to POST to `/api/v1/companies`.
   - Expected outcome: 403 with PORTAL_ERRORS.ROLE_MISMATCH
   - Evidence required: API response showing 403

8. **Form validation** — Submit the form with empty company name.
   - Expected outcome: Inline validation error on name field. Form does not submit.
   - Evidence required: Screenshot of validation error

## Flow Owner (SN-4)

**Owner:** Dev (developer)

## Tasks / Subtasks

- [x] Task 1: Create portal API infrastructure — `withApiHandler`, `successResponse`, `errorResponse` (AC: #7)
  - [x] 1.1 Create `apps/portal/src/lib/api-response.ts` — Copy from `apps/community/src/lib/api-response.ts`. Exports: `successResponse<T>(data, meta?, status?)`, `errorResponse(problem: ProblemDetails)`, `ProblemDetails` type. Same RFC 7807 contract. No changes needed to the logic — it's framework-agnostic.
  - [x] 1.2 Create `apps/portal/src/lib/api-middleware.ts` — Simplified version of community's `withApiHandler`. Must include:
    - CSRF validation (Origin vs Host header check, same logic as community)
    - `ApiError` catch → RFC 7807 `errorResponse()`
    - Unknown error catch → 500 with `errorResponse()`
    - Trace ID (`X-Request-Id` header — generate via `randomUUID()` if missing)
    - `Cache-Control: no-store` default
    - **Skip for now:** Sentry, metrics, rate limiting, maintenance mode, request context (add when portal gets monitoring stack in future story)
    - **Include:** `skipCsrf` option (for future webhook routes)
    - **Include:** `ALLOWED_ORIGINS` env var check in CSRF (for cross-subdomain requests from community)
  - [x] 1.3 Create `apps/portal/src/lib/api-error.ts` — Re-export `ApiError` from `@igbo/auth/api-error` for convenience: `export { ApiError } from "@igbo/auth/api-error"`. This keeps portal route imports clean (`import { ApiError } from "@/lib/api-error"`) while using the shared implementation.
  - [x] 1.4 Write tests: `api-middleware.test.ts` (8+ tests):
    - CSRF validation passes when Origin matches Host
    - CSRF validation fails when Origin differs from Host (403)
    - CSRF validation skipped for GET requests
    - CSRF validation skipped when `skipCsrf: true`
    - `ALLOWED_ORIGINS` cross-subdomain CSRF pass
    - ApiError caught and converted to RFC 7807 response
    - Unknown error caught and returns 500
    - Trace ID set from request header or generated
  - [x] 1.5 Write tests: `api-response.test.ts` (4+ tests):
    - `successResponse` returns JSON with data wrapper
    - `successResponse` with pagination meta
    - `errorResponse` returns RFC 7807 format
    - Content-Type is `application/problem+json` for errors

- [x] Task 2: Create portal upload API route for logo images (AC: #6)
  - [x] 2.1 **Depends on Task 1** (needs `withApiHandler`)
  - [x] 2.2 Check `apps/community/src/services/file-upload-service.ts` for the S3 upload pattern. **Do NOT look at the community route** — `apps/community/src/app/api/upload/file/route.ts` just calls `proxyUpload()` and contains zero S3 code. The service uses `@aws-sdk/client-s3` with `PutObjectCommand` for direct uploads.
  - [x] 2.3 Create `apps/portal/src/app/api/v1/upload/file/route.ts`:
    - `POST` handler wrapped with `withApiHandler`
    - Authenticate via `auth()` from `@igbo/auth` (any authenticated portal user can upload)
    - Accept `multipart/form-data` with a single `file` field
    - Validate file type (images only for now: `image/jpeg`, `image/png`, `image/webp`, `image/gif`) and size (max 5MB for logos)
    - Upload to S3 using the same bucket/credentials as community (env vars: `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
    - Generate object key: `portal/logos/{userId}/{uuid}.{ext}`
    - Create `platformFileUploads` record via `createFileUpload` from `@igbo/db/queries/file-uploads` — this function **already exists** with signature `createFileUpload({ uploaderId, objectKey, originalFilename?, fileType?, fileSize? })`. Do NOT create a new function. Newly inserted records default to `status = "processing"` — acceptable for portal logos at MVP.
    - Construct `publicUrl`: `` `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${objectKey}` ``
    - Return `{ fileUploadId, objectKey, publicUrl }`
  - [x] 2.4 Add `@aws-sdk/client-s3` to portal dependencies: `pnpm --filter portal add @aws-sdk/client-s3`
  - [x] 2.5 Write tests: `upload-file-route.test.ts` (6+ tests):
    - Unauthenticated request returns 401
    - Valid image upload returns 200 with fileUploadId + publicUrl
    - Oversized file returns 400
    - Invalid file type returns 400
    - Missing file field returns 400
    - Mock S3 client + `@igbo/db` queries

- [x] Task 3: Create Zod validation schema for company profiles (AC: #1, #8)
  - [x] 3.0 Add `zod` to portal dependencies: `pnpm --filter portal add zod@^4.3.6` — portal's `package.json` has no direct `zod` dependency; files that import `"zod/v4"` will fail without it.
  - [x] 3.1 Create `apps/portal/src/lib/validations/company.ts`:
    ```typescript
    import { z } from "zod/v4";

    export const INDUSTRY_OPTIONS = [
      "technology", "finance", "healthcare", "education", "manufacturing",
      "retail", "agriculture", "energy", "media", "consulting",
      "legal", "real_estate", "non_profit", "government", "other"
    ] as const;

    export const COMPANY_SIZE_OPTIONS = [
      "1-10", "11-50", "51-200", "201-500", "500+"
    ] as const;

    export const companyProfileSchema = z.object({
      name: z.string().min(1, "Company name is required").max(200),
      logoUrl: z.string().url().optional().or(z.literal("")),
      description: z.string().max(5000).optional(),
      industry: z.enum(INDUSTRY_OPTIONS).optional(),
      companySize: z.enum(COMPANY_SIZE_OPTIONS).optional(),
      cultureInfo: z.string().max(5000).optional(),
    });

    export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
    ```
  - [x] 3.2 Write tests: `company-validation.test.ts` (6+ tests):
    - Valid minimal input (name only) passes
    - Valid full input passes
    - Empty name fails with "Company name is required"
    - Name exceeding 200 chars fails
    - Invalid industry value fails
    - Invalid company size value fails

- [x] Task 4: Create company profile API routes (AC: #1, #2, #8)
  - [x] 4.1 **Depends on Tasks 1, 3, and 5** — Task 4.3's GET route calls `getCommunityTrustSignals` which must exist before implementing that route. Complete Task 5 first.
  - [x] 4.2 Create `apps/portal/src/app/api/v1/companies/route.ts`:
    - `POST` — Create company profile:
      - Authenticate via `requireEmployerRole()` from `@/lib/portal-permissions`
      - Parse body with `companyProfileSchema`
      - **First**: add `DUPLICATE_COMPANY_PROFILE: "PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE"` to `apps/portal/src/lib/portal-errors.ts` (no matching code exists yet)
      - Check if profile already exists via `getCompanyByOwnerId(session.user.id)` — if exists, throw `new ApiError({ title: "Company profile already exists", status: 409, extensions: { code: PORTAL_ERRORS.DUPLICATE_COMPANY_PROFILE } })`
      - Create via `createCompanyProfile({ ...validated, ownerUserId: session.user.id })`
      - Return `successResponse(profile, undefined, 201)`
    - `GET` — Get current employer's company profile:
      - Authenticate via `requireEmployerRole()`
      - Fetch via `getCompanyByOwnerId(session.user.id)`
      - If not found, return `successResponse(null)` (not 404 — absence is a valid state)
  - [x] 4.3 Create `apps/portal/src/app/api/v1/companies/[companyId]/route.ts`:
    - `GET` — Public company profile view:
      - No role requirement (any authenticated user or guest can view) — authenticate via `auth()` only to check session presence (optional)
      - Fetch via `getCompanyById(companyId)` where `companyId` is extracted from URL: `new URL(req.url).pathname.split("/").at(-1)`
      - If not found, throw `ApiError({ title: "Not found", status: 404 })`
      - Fetch trust signals via `getCommunityTrustSignals(profile.ownerUserId)` from `@igbo/db/queries/cross-app`
      - Return `successResponse({ ...profile, trustSignals })`
    - `PATCH` — Update company profile:
      - Authenticate via `requireEmployerRole()`
      - Extract `companyId` from URL
      - Fetch profile, verify `profile.ownerUserId === session.user.id` (owner check)
      - Parse body with `companyProfileSchema.partial()` (all fields optional for update)
      - Update via `updateCompanyProfile(companyId, validated)`
      - Return `successResponse(updated)`
  - [x] 4.4 Write tests: `companies-route.test.ts` (10+ tests):
    - POST: creates profile for employer (201)
    - POST: returns 409 if profile already exists
    - POST: returns 403 for non-employer
    - POST: returns 400 for invalid body (missing name)
    - POST: returns 401 for unauthenticated
    - GET: returns employer's own profile
    - GET: returns null when no profile exists
  - [x] 4.5 Write tests: `company-id-route.test.ts` (8+ tests):
    - GET: returns public profile with trust signals
    - GET: returns 404 for non-existent company
    - PATCH: updates profile fields for owner
    - PATCH: returns 403 for non-owner employer
    - PATCH: returns 403 for non-employer role
    - PATCH: returns 400 for invalid body
    - PATCH: updates only provided fields (partial update)
    - PATCH: refreshes updatedAt timestamp

- [x] Task 5: Extend cross-app trust signal query with `getCommunityTrustSignals` wrapper (AC: #3)
  - [x] 5.1 **`packages/db/src/queries/cross-app.ts` already exists — do NOT overwrite it.** It currently exports 4 functions: `getCommunityVerificationStatus`, `getMembershipDuration`, `getUserEngagementLevel`, `getReferralChain`. Read the file first, then **append** the following to the bottom:
    ```typescript
    export interface CommunityTrustSignals {
      isVerified: boolean;
      memberSince: Date | null;
      displayName: string | null;
      /** Points-based engagement level from getUserEngagementLevel */
      engagementLevel: "low" | "medium" | "high";
    }

    export async function getCommunityTrustSignals(
      userId: string
    ): Promise<CommunityTrustSignals | null> {
      const [user] = await db
        .select({ createdAt: authUsers.createdAt })
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .limit(1);
      if (!user) return null;

      const [profile] = await db
        .select({ displayName: communityProfiles.displayName })
        .from(communityProfiles)
        .where(eq(communityProfiles.userId, userId))
        .limit(1);

      const verification = await getCommunityVerificationStatus(userId);
      const engagement = await getUserEngagementLevel(userId);

      return {
        isVerified: verification.isVerified,
        memberSince: user.createdAt,
        displayName: profile?.displayName ?? null,
        engagementLevel: engagement.level as "low" | "medium" | "high",
      };
    }
    ```
  - [x] 5.2 **No changes to `@igbo/db`'s `index.ts` or `package.json`** — the package already exports all queries under `@igbo/db/queries/*` via the `"./queries/*"` wildcard in `packages/db/package.json`. `@igbo/db/queries/cross-app` is already importable as a path import. Do NOT add `export * from "./queries/cross-app"` to `index.ts` — that file only spreads schemas and never exports query functions.
  - [x] 5.3 **`packages/db/src/queries/cross-app.test.ts` already exists** — do NOT overwrite it. Append new tests for the wrapper only:
    - `getCommunityTrustSignals` returns null for non-existent user
    - Returns `isVerified: true` when user has a badge
    - Returns correct `displayName` from community profile
    - Returns `displayName: null` when no community profile row exists
    - Returns `engagementLevel` passthrough from `getUserEngagementLevel`

- [x] Task 6: Create `LogoUpload` component (AC: #6)
  - [x] 6.1 Create `apps/portal/src/components/domain/logo-upload.tsx` — Client Component
  - [x] 6.2 Implementation:
    - Accept props: `currentLogoUrl?: string`, `onUploadComplete: (url: string) => void`, `onError?: (error: string) => void`
    - Render a clickable area (dashed border) with current logo preview or placeholder (Building2 icon)
    - On file select: validate type (image/*) and size (5MB max) client-side
    - Upload via `fetch("/api/v1/upload/file", { method: "POST", body: formData })` — use fetch (not XHR) for simplicity in portal since we don't need granular progress for a single logo
    - Show loading spinner during upload
    - On success: call `onUploadComplete(publicUrl)`, show preview
    - On error: show inline error message, call `onError`
    - Accessible: proper `aria-label`, keyboard focusable (hidden file input triggered by visible button)
  - [x] 6.3 Export `LogoUploadSkeleton` from same file (architecture convention: domain components export skeletons)
  - [x] 6.4 Write tests: `logo-upload.test.ts` (6+ tests):
    - Renders upload area with placeholder when no logo
    - Renders current logo preview when `currentLogoUrl` provided
    - Calls onUploadComplete after successful upload (mock fetch)
    - Shows error for oversized file
    - Shows error for invalid file type
    - axe-core accessibility assertion

- [x] Task 7: Create `CompanyProfileForm` component (AC: #1, #2, #10)
  - [x] 7.1 **Depends on Tasks 3, 6**
  - [x] 7.2 Create `apps/portal/src/components/flow/company-profile-form.tsx` — Client Component
  - [x] 7.3 Props: `mode: "create" | "edit"`, `initialData?: PortalCompanyProfile`, `onSuccess?: () => void`
  - [x] 7.4 Implementation:
    - Use React `useState` for form fields (name, logoUrl, description, industry, companySize, cultureInfo)
    - Client-side validation via `companyProfileSchema.safeParse()` on submit
    - Display inline validation errors under each field (via `aria-describedby` for a11y)
    - Submit: POST to `/api/v1/companies` (create mode) or PATCH to `/api/v1/companies/{id}` (edit mode)
    - On success: toast notification ("Company profile created" / "Company profile updated"), call `onSuccess()`
    - On 409 (duplicate): toast error "You already have a company profile"
    - Fields:
      - **Name**: `<Input>` (required, max 200)
      - **Logo**: `<LogoUpload>` component
      - **Description**: `<Textarea>` (optional, max 5000 chars, with character count)
      - **Industry**: `<Select>` with options from `INDUSTRY_OPTIONS` (display with i18n labels)
      - **Company Size**: `<Select>` with options from `COMPANY_SIZE_OPTIONS`
      - **Culture Info**: `<Textarea>` (optional, max 5000 chars)
    - Loading state: disable submit button while saving, show spinner
  - [x] 7.5 Ensure all UI components needed exist in portal's shadcn/ui. Check for: `Input`, `Textarea`, `Select`, `Label`, `Card`. Copy from community if missing. **Do NOT install new shadcn components via CLI** — copy manually from community's `src/components/ui/` to maintain consistency.
  - [x] 7.6 Export `CompanyProfileFormSkeleton` from same file
  - [x] 7.7 Write tests: `company-profile-form.test.ts` (10+ tests):
    - Renders all form fields in create mode
    - Renders pre-filled fields in edit mode
    - Shows validation error when name is empty on submit
    - Submits POST request in create mode with correct payload
    - Submits PATCH request in edit mode with correct payload
    - Shows success toast on successful create
    - Shows success toast on successful update
    - Shows error toast on 409 duplicate
    - Disables submit button while loading
    - axe-core accessibility assertion
    - **Mock pattern**: Mock `fetch` globally; mock `next-intl` `useTranslations`; mock `sonner` `toast`

- [x] Task 8: Create `TrustBadge` semantic component (AC: #3)
  - [x] 8.1 Create `apps/portal/src/components/semantic/trust-badge.tsx` — Client Component (per architecture: semantic layer)
  - [x] 8.2 Props: `trustSignals: CommunityTrustSignals`
  - [x] 8.3 Renders:
    - Verification badge icon (ShieldCheck from lucide-react) if `isVerified`
    - "Member since {year}" text from `memberSince`
    - Engagement level pill (color-coded: low=gray, medium=blue, high=green) — values are `"low" | "medium" | "high"` from `CommunityTrustSignals.engagementLevel`, not "new"/"active"/"established"/"trusted"
    - All text via i18n keys `Portal.trust.*`
  - [x] 8.4 Export `TrustBadgeSkeleton` (architecture convention)
  - [x] 8.5 Write tests: `trust-badge.test.ts` (4+ tests):
    - Renders verification badge for verified user
    - Does not render verification badge for unverified user
    - Renders correct engagement level pill
    - axe-core accessibility assertion

- [x] Task 9: Create company profile pages (AC: #1, #2, #3, #4)
  - [x] 9.1 **Depends on Tasks 4, 7, 8**
  - [x] 9.2 Create `apps/portal/src/app/[locale]/company-profile/page.tsx` — Employer's own profile page:
    - Server Component that calls `auth()` to get session
    - If not authenticated or not EMPLOYER role → redirect to portal home
    - Fetch own profile via `getCompanyByOwnerId(session.user.id)` using `@igbo/db/queries/portal-companies`
    - If no profile: render `<CompanyProfileForm mode="create" />`
    - If profile exists: render profile view with company info, logo, and "Edit" button
    - Edit mode: use URL param `?edit=true` (Server Component reads from `searchParams` prop — `{ searchParams: Promise<{ edit?: string }> }`) → render `<CompanyProfileForm mode="edit" initialData={profile} />`. Prefer URL param over client-side state — it's linkable and consistent with App Router conventions.
  - [x] 9.3 Create `apps/portal/src/app/[locale]/companies/[companyId]/page.tsx` — Public company profile:
    - Server Component (ISR `revalidate = 60` for public views)
    - Fetch company via `getCompanyById(companyId)`
    - If not found: `notFound()` (Next.js 404)
    - Fetch trust signals via `getCommunityTrustSignals(profile.ownerUserId)`
    - Render company info + `<TrustBadge trustSignals={signals} />`
    - Render "Active Job Postings" section — empty state for now: "No job postings yet" (stub until P-1.3A+)
  - [x] 9.4 Write tests: `company-profile-page.test.tsx` (6+ tests):
    - Renders create form when no profile exists
    - Renders profile view when profile exists
    - Renders edit form when `?edit=true` param present (or after clicking Edit)
    - Redirects non-employer to home
    - Redirects unauthenticated to home
  - [x] 9.5 Write tests: `company-detail-page.test.tsx` (4+ tests):
    - Renders company profile with trust signals
    - Renders 404 for non-existent company
    - Renders empty state for job postings
    - Renders company logo if present

- [x] Task 10: Implement company profile gate (AC: #5)
  - [x] 10.1 Create `apps/portal/src/lib/require-company-profile.ts` — Server-side utility:
    ```typescript
    import "server-only";
    import { auth } from "@igbo/auth";
    import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
    import { redirect } from "next/navigation";

    export async function requireCompanyProfile(locale: string) {
      const session = await auth();
      if (!session?.user || session.user.activePortalRole !== "EMPLOYER") return null;
      const profile = await getCompanyByOwnerId(session.user.id);
      if (!profile) {
        redirect(`/${locale}/company-profile?onboarding=true`);
      }
      return profile;
    }
    ```
  - [x] 10.2 Add gate check to employer-only pages that require a company profile:
    - `apps/portal/src/app/[locale]/my-jobs/page.tsx` — Stub page (create if not exists) with `requireCompanyProfile(locale)` call at top
    - `apps/portal/src/app/[locale]/dashboard/page.tsx` — If employer dashboard exists, add gate (or create stub)
    - **Pattern**: Each gated page calls `requireCompanyProfile(locale)` as its first async operation. If it redirects, the page never renders.
  - [x] 10.3 Add `onboarding=true` query param handling in company-profile page — when present, show a toast: "Create your company profile to get started"
  - [x] 10.4 Write tests: `require-company-profile.test.ts` (4+ tests):
    - Returns profile when exists
    - Redirects when no profile (mock `redirect`)
    - Returns null for non-employer
    - Returns null for unauthenticated

- [x] Task 11: Add i18n keys (AC: #9)
  - [x] 11.1 Add to `apps/portal/messages/en.json` under `Portal.company`:
    ```json
    "company": {
      "createTitle": "Create Company Profile",
      "editTitle": "Edit Company Profile",
      "viewTitle": "Company Profile",
      "name": "Company Name",
      "namePlaceholder": "Enter your company name",
      "nameRequired": "Company name is required",
      "logo": "Company Logo",
      "logoUpload": "Upload logo",
      "logoUploading": "Uploading...",
      "description": "Description",
      "descriptionPlaceholder": "Tell job seekers about your company",
      "industry": "Industry",
      "industryPlaceholder": "Select an industry",
      "companySize": "Company Size",
      "companySizePlaceholder": "Select company size",
      "cultureInfo": "Culture & Values",
      "cultureInfoPlaceholder": "What makes your company culture unique?",
      "save": "Save Profile",
      "saving": "Saving...",
      "created": "Company profile created successfully",
      "updated": "Company profile updated successfully",
      "duplicateError": "You already have a company profile",
      "edit": "Edit Profile",
      "activeJobs": "Active Job Postings",
      "noJobsYet": "No job postings yet",
      "createProfileFirst": "Create your company profile to get started",
      "onboardingPrompt": "You need a company profile before posting jobs"
    }
    ```
  - [x] 11.2 Add to `apps/portal/messages/en.json` under `Portal.trust`:
    ```json
    "trust": {
      "verifiedMember": "Verified Member",
      "memberSince": "Member since {year}",
      "engagementLow": "New Member",
      "engagementMedium": "Active Member",
      "engagementHigh": "Trusted Member",
      "communityTrust": "Community Trust"
    }
    ```
  - [x] 11.3 Add to `apps/portal/messages/en.json` under `Portal.upload`:
    ```json
    "upload": {
      "dragOrClick": "Drag & drop or click to upload",
      "maxSize": "Max file size: {size}MB",
      "invalidType": "Invalid file type. Accepted: {types}",
      "tooLarge": "File too large. Maximum size: {size}MB",
      "uploadFailed": "Upload failed. Please try again.",
      "uploading": "Uploading..."
    }
    ```
  - [x] 11.4 Add industry option i18n keys under `Portal.industries`:
    ```json
    "industries": {
      "technology": "Technology",
      "finance": "Finance & Banking",
      "healthcare": "Healthcare",
      "education": "Education",
      "manufacturing": "Manufacturing",
      "retail": "Retail & Commerce",
      "agriculture": "Agriculture",
      "energy": "Energy & Utilities",
      "media": "Media & Entertainment",
      "consulting": "Consulting",
      "legal": "Legal",
      "real_estate": "Real Estate",
      "non_profit": "Non-Profit",
      "government": "Government",
      "other": "Other"
    }
    ```
  - [x] 11.5 Add matching Igbo translations to `apps/portal/messages/ig.json` for all new keys
  - [x] 11.6 Verify no hardcoded strings in any new component — all user-facing text via `useTranslations()`

- [x] Task 12: Add missing shadcn/ui components to portal (AC: #1)
  - [x] 12.1 Portal already has in `apps/portal/src/components/ui/`: Button, Badge, DropdownMenu, Sheet, Tooltip, Sonner, **Avatar**, **Separator**. Only these are missing and need to be copied: `Input`, `Textarea`, `Select` (+ `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`), `Label`, `Card` (+ `CardHeader`, `CardContent`, `CardFooter`). Do NOT copy Separator or Avatar — they already exist.
  - [x] 12.2 For each missing component, copy from `apps/community/src/components/ui/` to `apps/portal/src/components/ui/`. **Do not use `npx shadcn add`** — the community versions are the canonical source. Verify imports resolve correctly (Radix primitives from `radix-ui` package).
  - [x] 12.3 No tests needed for UI primitives (they are well-tested upstream by shadcn/Radix)

- [x] Task 13: Write comprehensive integration-level tests (AC: all)
  - [x] 13.1 **Depends on all previous tasks**
  - [x] 13.2 Run full portal test suite: `pnpm --filter portal test` — all passing (229 tests)
  - [x] 13.3 Run `@igbo/db` test suite: `pnpm --filter @igbo/db test` — all passing (685 tests)
  - [x] 13.4 Run `@igbo/auth` test suite: `pnpm --filter @igbo/auth test` — no regressions (122 tests)
  - [x] 13.5 Run community test suite: `pnpm --filter community test` — no regressions (4315 tests)
  - [x] 13.6 TypeScript typecheck: `pnpm exec turbo run typecheck` — zero errors across all packages

## Dev Notes

### Portal API Infrastructure (CRITICAL — First Portal API Routes)

This story introduces the first non-auth API routes in the portal. The portal currently has ZERO API infrastructure beyond the Auth.js `[...nextauth]` route. You must create:

1. **`apps/portal/src/lib/api-response.ts`** — Copy from `apps/community/src/lib/api-response.ts` (lines 1-78). Same `successResponse`/`errorResponse` contract. The comment block at top is important — it documents the RFC 7807 contract.

2. **`apps/portal/src/lib/api-middleware.ts`** — Simplified `withApiHandler`. The community version (244 lines) includes Sentry, metrics, rate limiting, maintenance mode, request context. **Portal version should be ~80 lines** — just CSRF + error handling + trace ID. Can be extended later.

   Explicit function signature to implement:
   ```typescript
   export function withApiHandler(
     handler: (req: Request) => Promise<Response>,
     options?: { skipCsrf?: boolean }
   ): (req: Request) => Promise<Response>
   ```

   For `ALLOWED_ORIGINS` CSRF bypass: use `process.env.ALLOWED_ORIGINS ?? ""` directly — **do NOT use `env.ALLOWED_ORIGINS`**. Portal has no `@/env` module. Portal follows the @igbo/auth pattern of direct `process.env` reads.

3. **`apps/portal/src/lib/api-error.ts`** — Re-export from `@igbo/auth/api-error`. This exists so portal routes import `ApiError` from `@/lib/api-error` (consistent with community pattern).

**Community source files for reference:**
- `apps/community/src/lib/api-response.ts` — successResponse, errorResponse, validationErrorResponse, ProblemDetails type (copy the full file — it's 85 lines)
- `apps/community/src/server/api/middleware.ts` — withApiHandler (full version — simplify for portal)
- `apps/community/src/services/file-upload-service.ts` — actual S3 upload logic (NOT the upload route)
- `apps/community/src/lib/api-error.ts` — ApiError class (already in @igbo/auth, just re-export)

### Route Param Extraction Pattern

Portal routes extract dynamic params from URL (same pattern as community):
```typescript
const companyId = new URL(req.url).pathname.split("/").at(-1);
```
`withApiHandler` only passes `request` (not Next.js route params). This is documented in MEMORY.md as a critical pattern.

### Existing Query Functions (DO NOT re-implement)

`packages/db/src/queries/portal-companies.ts` already exports:
- `createCompanyProfile(data)` → `PortalCompanyProfile`
- `getCompanyByOwnerId(ownerUserId)` → `PortalCompanyProfile | null`
- `getCompanyById(id)` → `PortalCompanyProfile | null`
- `updateCompanyProfile(id, data)` → `PortalCompanyProfile | null`

These are complete and tested. **Do NOT rewrite them.** Create API routes that call these functions.

### Schema Already Exists (DO NOT create migration)

`portal_company_profiles` table was created in P-1.1A (migration 0049). Schema is at `packages/db/src/schema/portal-company-profiles.ts`. Columns:
- `id` (UUID PK), `ownerUserId` (FK→authUsers, CASCADE), `name` (VARCHAR 200, NOT NULL), `logoUrl` (TEXT), `description` (TEXT), `industry` (VARCHAR 100), `companySize` (VARCHAR 50), `cultureInfo` (TEXT), `trustBadge` (BOOLEAN default false), `createdAt`, `updatedAt`

**No new migration needed for this story.**

### File Upload in Portal — Key Decision

The community file upload uses XHR (not fetch) for progress events. For portal company logos, **use `fetch`** instead — simpler, and logos are small files where granular progress isn't critical. The `LogoUpload` component is a simplified upload for a single image, not the multi-file attachment flow from community.

**Upload route** at `apps/portal/src/app/api/v1/upload/file/route.ts`:
- Uses the same S3 bucket as community (shared infrastructure)
- Writes to `platformFileUploads` table via `@igbo/db` queries
- Object key prefix: `portal/logos/` (distinct from community uploads)

**Check if `@igbo/db` exports file upload queries.** If `createFileUpload` / `createPlatformFileUpload` exists in `packages/db/src/queries/`, use it. If not (upload queries may still be in `apps/community/src/`), create a minimal `insertFileUpload` in `@igbo/db/queries/uploads.ts`.

### Trust Signal Implementation — Pragmatic Approach

The architecture specifies a full `trust-signal-service.ts` but for P-1.2 we only need a database query function. The service layer can be added when trust signals are used across multiple portal surfaces.

**`getCommunityTrustSignals(userId)`** is a new wrapper function to be added to the existing `@igbo/db/queries/cross-app.ts`. It composes 3 already-existing functions in that file:
- `getCommunityVerificationStatus(userId)` → isVerified + verifiedAt + badgeType
- `getUserEngagementLevel(userId)` → level (`"low"/"medium"/"high"`) + score + lastActive

The `CommunityTrustSignals` interface uses `engagementLevel: "low" | "medium" | "high"` (matching the existing `getUserEngagementLevel` output). The `TrustBadge` component must use these values — **not** "new"/"active"/"established"/"trusted".

Rule: **Read only from community tables, never write** (architecture constraint)

### Permission Pattern — `requireEmployerRole()`

Already exists at `apps/portal/src/lib/portal-permissions.ts`. Uses `auth()` from `@igbo/auth` and checks `session.user.activePortalRole === "EMPLOYER"`. Returns session on success, throws `ApiError(403)` on failure.

### Company Profile Gate — Server-Side Redirect

The gate uses `redirect()` from `next/navigation` in a Server Component. Pattern:
```typescript
// In page.tsx (Server Component):
const profile = await requireCompanyProfile(locale);
// If this returns, profile exists. If it redirects, page never renders.
```

This is a standard Next.js App Router pattern. The redirect throws (does not return), so code after it is unreachable if the user has no profile.

### Zod Import Pattern

**CRITICAL**: Import Zod from `"zod/v4"` (NOT `"zod"`). This is a project-wide convention documented in MEMORY.md. Validation errors use `parsed.error.issues[0]` (NOT `parsed.issues[0]`).

### shadcn/ui Components Needed

Portal currently has in `apps/portal/src/components/ui/`: `Button`, `Badge`, `DropdownMenu`, `Sheet`, `Tooltip`, `Sonner`, `Avatar`, `Separator`. **Still missing** (must copy from community):
- `Input` — for name field
- `Textarea` — for description, culture info
- `Select` (+ `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`) — for industry, company size
- `Label` — for form field labels
- `Card` (+ `CardHeader`, `CardContent`, `CardFooter`) — for profile display card

**Do NOT copy `Separator` or `Avatar`** — they already exist. **Copy from community's `apps/community/src/components/ui/`**. These use `radix-ui` (unified package), which is already in portal's dependencies.

### Test Mock Patterns for Portal

**API route tests** (server-side):
```typescript
// @vitest-environment node
vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  createCompanyProfile: vi.fn(),
  getCompanyByOwnerId: vi.fn(),
  getCompanyById: vi.fn(),
  updateCompanyProfile: vi.fn(),
}));
```

**Component tests** (jsdom):
```typescript
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => "en",
}));
```

**axe-core** (every component test):
```typescript
import { axe, toHaveNoViolations } from "jest-axe";
expect.extend(toHaveNoViolations);
// In test:
// @ts-ignore
expect(await axe(container)).toHaveNoViolations();
```

### Integration Tests (SN-3 — Missing Middle)

- API route tests should use real `withApiHandler` wrapper (not mocked) to verify CSRF + error handling chain
- Company profile CRUD: test full create → read → update cycle via API routes with mocked DB queries
- Trust signal: test that `getCommunityTrustSignals` correctly joins across community tables
- Upload: test that upload route correctly calls S3 + creates DB record (both mocked)

### Previous Story Intelligence (P-1.1B)

Key learnings from P-1.1B:
- **DropdownMenuRadioGroup was missing** from portal's shadcn — always verify UI components exist before writing code that uses them
- **`declare module "vitest"` strips vitest exports** — use `// @ts-ignore` instead of type augmentation for jest-axe
- **Radix components need `userEvent.setup()`** (not `fireEvent.click`) — Radix listens to `pointerdown`
- **`update` from `useSession()`** is on the hook result, NOT on session data. This pattern is critical and documented.
- **Sonner Toaster must be in layout** — without `<Toaster />` in layout.tsx, `toast()` calls are silent. Already added in P-1.1B.

### Project Structure Notes

**New files:**
```
apps/portal/src/
├── lib/
│   ├── api-response.ts                     # NEW — successResponse, errorResponse, ProblemDetails
│   ├── api-middleware.ts                    # NEW — withApiHandler (simplified)
│   ├── api-error.ts                        # NEW — re-export ApiError from @igbo/auth
│   ├── require-company-profile.ts          # NEW — server-side gate
│   └── validations/
│       └── company.ts                      # NEW — Zod schema + constants
├── app/api/v1/
│   ├── upload/file/
│   │   ├── route.ts                        # NEW — logo upload endpoint
│   │   └── route.test.ts                   # NEW
│   └── companies/
│       ├── route.ts                        # NEW — POST create, GET own
│       ├── route.test.ts                   # NEW
│       └── [companyId]/
│           ├── route.ts                    # NEW — GET public, PATCH update
│           └── route.test.ts              # NEW
├── app/[locale]/
│   ├── company-profile/
│   │   ├── page.tsx                        # NEW — employer create/view/edit
│   │   └── page.test.tsx                   # NEW
│   ├── companies/[companyId]/
│   │   ├── page.tsx                        # NEW — public company profile
│   │   └── page.test.tsx                   # NEW
│   ├── my-jobs/
│   │   └── page.tsx                        # NEW (stub — gate + empty state)
│   └── dashboard/
│       └── page.tsx                        # MODIFIED or NEW (add gate if employer)
├── components/
│   ├── flow/
│   │   ├── company-profile-form.tsx        # NEW — create/edit form
│   │   └── company-profile-form.test.tsx   # NEW
│   ├── domain/
│   │   ├── logo-upload.tsx                 # NEW — image upload component
│   │   └── logo-upload.test.tsx            # NEW
│   └── semantic/
│       ├── trust-badge.tsx                 # NEW — community trust signals
│       └── trust-badge.test.tsx            # NEW
├── components/ui/
│   ├── input.tsx                           # NEW (copied from community)
│   ├── textarea.tsx                        # NEW (copied from community)
│   ├── select.tsx                          # NEW (copied from community)
│   ├── label.tsx                           # NEW (copied from community)
│   ├── card.tsx                            # NEW (copied from community)
│   └── separator.tsx                       # ALREADY EXISTS — do not copy
└── messages/
    ├── en.json                             # MODIFIED (add Portal.company, Portal.trust, Portal.upload, Portal.industries)
    └── ig.json                             # MODIFIED (matching Igbo translations)

packages/db/src/queries/
└── cross-app.ts                            # MODIFIED — append getCommunityTrustSignals wrapper + CommunityTrustSignals interface

packages/db/src/queries/
└── cross-app.test.ts                       # MODIFIED — append wrapper tests (existing tests must not be overwritten)
```

**Modified files:**
```
packages/db/src/index.ts                    # NOT MODIFIED — cross-app already accessible via @igbo/db/queries/cross-app path import
apps/portal/package.json                    # MODIFIED — add @aws-sdk/client-s3 AND zod@^4.3.6
apps/portal/src/lib/portal-errors.ts       # MODIFIED — add DUPLICATE_COMPANY_PROFILE error code
apps/portal/src/lib/api-middleware.test.ts   # NEW
apps/portal/src/lib/api-response.test.ts     # NEW
apps/portal/src/lib/validations/company.test.ts  # NEW
apps/portal/src/lib/require-company-profile.test.ts  # NEW
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2 (lines 514-548)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Portal API Routes (lines 1942-1991)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Portal Component Organization (lines 2009-2043)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Trust Signal Pipeline (line 1405)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Cross-Cutting Concerns #9 Bilingual, #11 File Upload (lines 1409, 1411)]
- [Source: packages/db/src/schema/portal-company-profiles.ts — schema definition]
- [Source: packages/db/src/queries/portal-companies.ts — existing CRUD queries]
- [Source: apps/portal/src/lib/portal-permissions.ts — requireEmployerRole()]
- [Source: apps/portal/src/lib/portal-errors.ts — PORTAL_ERRORS constants]
- [Source: apps/community/src/server/api/middleware.ts — withApiHandler reference implementation]
- [Source: apps/community/src/lib/api-response.ts — successResponse/errorResponse reference]
- [Source: _bmad-output/implementation-artifacts/p-1-1b-role-switcher-portal-navigation.md — previous story]

## Definition of Done (SN-1)

- [x] All acceptance criteria met
- [ ] All validation scenarios demonstrated with evidence
- [x] Unit tests written and passing
- [x] Integration tests written and passing (SN-3)
- [ ] Flow owner has verified the complete end-to-end chain
- [x] No pre-existing test regressions introduced

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Validation Evidence

<!-- Attach or link evidence for each validation scenario before moving to review -->

### Debug Log References

- S3Client mock must use `class MockS3Client { send = mockS3Send; }` syntax — `vi.fn().mockImplementation(() => ({ send: vi.fn() }))` fails vitest constructor mock (returns undefined send). Also: `mockS3Send.mockResolvedValue({})` must be reset in `beforeEach` after `vi.clearAllMocks()`.
- Page tests (company-profile/page, companies/[companyId]/page) must NOT have `// @vitest-environment node` — they call `render()` which requires jsdom. Server-only pages with `// @vitest-environment node` can only do logic assertions, not render.
- `vi.mocked(auth).mockResolvedValue(null)` fails TS strict — use `null as never` cast in all auth-null test cases.
- CI scanner (`check-process-env.ts`) flags every `process.env.X` line — add `// ci-allow-process-env` inline comment on each line (Tier 3 exemption).
- `portal-errors.test.ts` had a hardcoded `toHaveLength(6)` count — updated to 7 when DUPLICATE_COMPANY_PROFILE was added.

### Completion Notes List

- Upload route uses Hetzner S3 env vars (`HETZNER_S3_*`) to match community's actual infrastructure — story spec mentioned generic names but community uses Hetzner naming conventions.
- `community/src/components/ui/textarea.tsx` did not exist — created from scratch following shadcn/ui conventions (community has no Textarea component).
- `my-jobs/page.tsx` created as a stub page with `requireCompanyProfile` gate — dashboard gate deferred (dashboard page did not exist and was out of scope for this story).
- `onboarding=true` param detection implemented in company-profile page via searchParams prop; toast display is stubbed at the component level (next-intl `getTranslations` used server-side).
- Trust signals use `getCommunityTrustSignals` wrapper which composes 3 existing cross-app query functions. No new DB schema required.
- Portal now has full API infrastructure: `withApiHandler`, `successResponse`, `errorResponse`, `ApiError` re-export — ready for P-1.3+.

### File List

**New files:**
- `apps/portal/src/lib/api-response.ts`
- `apps/portal/src/lib/api-response.test.ts`
- `apps/portal/src/lib/api-middleware.ts`
- `apps/portal/src/lib/api-middleware.test.ts`
- `apps/portal/src/lib/api-error.ts`
- `apps/portal/src/lib/validations/company.ts`
- `apps/portal/src/lib/validations/company.test.ts`
- `apps/portal/src/lib/require-company-profile.ts`
- `apps/portal/src/lib/require-company-profile.test.ts`
- `apps/portal/src/app/api/v1/upload/file/route.ts`
- `apps/portal/src/app/api/v1/upload/file/route.test.ts`
- `apps/portal/src/app/api/v1/companies/route.ts`
- `apps/portal/src/app/api/v1/companies/route.test.ts`
- `apps/portal/src/app/api/v1/companies/[companyId]/route.ts`
- `apps/portal/src/app/api/v1/companies/[companyId]/route.test.ts`
- `apps/portal/src/app/[locale]/company-profile/page.tsx`
- `apps/portal/src/app/[locale]/company-profile/page.test.tsx`
- `apps/portal/src/app/[locale]/companies/[companyId]/page.tsx`
- `apps/portal/src/app/[locale]/companies/[companyId]/page.test.tsx`
- `apps/portal/src/app/[locale]/my-jobs/page.tsx`
- `apps/portal/src/components/domain/logo-upload.tsx`
- `apps/portal/src/components/domain/logo-upload.test.tsx`
- `apps/portal/src/components/semantic/trust-badge.tsx`
- `apps/portal/src/components/semantic/trust-badge.test.tsx`
- `apps/portal/src/components/flow/company-profile-form.tsx`
- `apps/portal/src/components/flow/company-profile-form.test.tsx`
- `apps/portal/src/components/ui/input.tsx`
- `apps/portal/src/components/ui/textarea.tsx`
- `apps/portal/src/components/ui/label.tsx`
- `apps/portal/src/components/ui/card.tsx`
- `apps/portal/src/components/ui/select.tsx`

**Modified files:**
- `apps/portal/src/lib/portal-errors.ts` — added DUPLICATE_COMPANY_PROFILE
- `apps/portal/src/lib/portal-errors.test.ts` — updated count 6→7, added new code test
- `apps/portal/messages/en.json` — added Portal.company, Portal.trust, Portal.upload, Portal.industries
- `apps/portal/messages/ig.json` — matching Igbo translations
- `apps/portal/package.json` — added zod@^4.3.6, @aws-sdk/client-s3
- `packages/db/src/queries/cross-app.ts` — appended CommunityTrustSignals interface + getCommunityTrustSignals
- `packages/db/src/queries/cross-app.test.ts` — appended 5 tests for getCommunityTrustSignals
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — p-1-2 status: review

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-04 | Initial implementation of P-1.2: Portal API infrastructure, upload route, company profile CRUD routes, CompanyProfileForm, LogoUpload, TrustBadge, profile pages, company profile gate, i18n keys, shadcn/ui additions. 80 new portal tests, 5 new @igbo/db tests. | claude-sonnet-4-6 |
| 2026-04-04 | Code review: Fixed 5 HIGH + 5 MEDIUM issues. H1: LogoUpload aria-label fix, H2: img alt i18n, H3/H4: industry display i18n on view/detail pages, H5: onboarding toast (was static text). M1: my-jobs hardcoded string, M2: form error string i18n, M3: S3Client lazy singleton, M4: getCommunityTrustSignals Promise.all parallelization, M5: validationErrorResponse RFC 7807 detail field. +4 new tests (233 portal total). | claude-opus-4-6 |
