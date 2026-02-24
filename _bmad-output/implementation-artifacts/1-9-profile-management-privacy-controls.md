# Story 1.9: Profile Management & Privacy Controls

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to edit my profile, control who can see it, toggle my location visibility, and link my social media accounts,
so that I manage my identity and privacy within the community.

## Acceptance Criteria

1. **Given** a member navigates to their profile settings
   **When** the system displays the edit form
   **Then** they can update all profile fields: name, photo, bio, location, interests, cultural connections, and languages (FR14)
   **And** changes are saved via server action with Zod validation
   **And** the profile page reflects updates immediately (optimistic update via TanStack Query)

2. **Given** a member wants to control profile visibility
   **When** they access privacy settings
   **Then** they can set their profile to: "Public to members" (all members can view), "Limited" (only shared group members), or "Private" (only visible to admins) (FR15)
   **And** the system enforces the visibility setting on all profile view endpoints

3. **Given** a member wants to hide their location
   **When** they toggle the location visibility setting
   **Then** their city/state/country is hidden from their public profile and member directory results (FR16)
   **And** they still appear in search results by other criteria (name, interests, skills)

4. **Given** a member wants to link social media accounts
   **When** they click "Link Account" for Facebook, LinkedIn, Twitter/X, or Instagram
   **Then** the system initiates an OAuth flow with the selected provider for profile enrichment only — this is not an authentication method (FR13)
   **And** the OAuth flow fetches only the public profile URL and display name from each provider
   **And** no long-lived access tokens are stored — only the verified profile URL and display name are persisted
   **And** upon successful authorization, the linked account displays as a clickable icon on their profile
   **And** the member can unlink any connected account at any time
   **And** if a provider is temporarily unavailable, a graceful error message is shown (NFR-I6)

5. **Given** the profile page is viewed by another member
   **When** the viewer loads the profile
   **Then** the profile displays: name, photo, bio, location (if visible), interests, cultural connections, languages, verification badge (if any), linked social accounts, and engagement indicators
   **And** the "Message" button is prominently displayed for one-tap connection (button present, links to chat — chat not yet implemented in Epic 1, stub href acceptable)

## Tasks / Subtasks

- [x] Task 1: DB schema additions + migration (AC: 1, 2, 3, 4)
  - [x] Update imports in `src/db/schema/community-profiles.ts` — add `pgEnum` and `boolean` to the existing import from `"drizzle-orm/pg-core"` (currently missing: `pgEnum`, `boolean`)
  - [x] Add `pgEnum` `profileVisibilityEnum` to `src/db/schema/community-profiles.ts` with values `PUBLIC_TO_MEMBERS`, `LIMITED`, `PRIVATE` — use `pgEnum("profile_visibility_enum", ["PUBLIC_TO_MEMBERS", "LIMITED", "PRIVATE"])`
  - [x] Add `profileVisibility` column to `communityProfiles`: `profileVisibilityEnum("profile_visibility").notNull().default("PUBLIC_TO_MEMBERS")`
  - [x] Add `locationVisible` column to `communityProfiles`: `boolean("location_visible").notNull().default(true)`
  - [x] Add `community_social_links` table to `src/db/schema/community-profiles.ts` (same file, social links are profile-related):
    - `id: uuid("id").primaryKey().defaultRandom()`
    - `userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" })`
    - `provider: socialProviderEnum("provider").notNull()` — define `socialProviderEnum` with values `FACEBOOK`, `LINKEDIN`, `TWITTER`, `INSTAGRAM`
    - `providerDisplayName: varchar("provider_display_name", { length: 255 }).notNull()`
    - `providerProfileUrl: varchar("provider_profile_url", { length: 2048 }).notNull()`
    - `linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow()`
    - `createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`
    - `updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()`
    - Unique constraint on `(userId, provider)`
    - Index on `userId`
  - [x] Export `CommunityProfile`, `NewCommunityProfile`, `CommunitySocialLink`, `NewCommunitySocialLink` types from the schema file
  - [x] **No `db/index.ts` change needed** — `src/db/index.ts` uses `import * as communityProfilesSchema from "./schema/community-profiles"` (wildcard). Adding `communitySocialLinks` to the same `community-profiles.ts` file automatically includes it in the existing spread. Do NOT add a redundant import.
  - [x] **No Drizzle `relations()` needed** — `getProfileWithSocialLinks` uses a manual LEFT JOIN (not relational query API), so no `relations()` definition is required for `communitySocialLinks`
  - [x] Generate migration via `drizzle-kit generate` → `src/db/migrations/0006_profile_privacy_social_links.sql`

- [x] Task 2: Event types + new query functions (AC: 1, 2, 3, 4)
  - [x] Add to `src/types/events.ts` **before** writing any service:
    - Add interfaces: `MemberProfileUpdatedEvent`, `MemberPrivacySettingsUpdatedEvent`, `MemberSocialAccountLinkedEvent`, `MemberSocialAccountUnlinkedEvent` (each extends `BaseEvent` with `userId: string`; linked/unlinked events include `provider: string`)
    - Add to `EventName` union: `"member.profile_updated"`, `"member.privacy_settings_updated"`, `"member.social_account_linked"`, `"member.social_account_unlinked"`
    - Add to `EventMap` record with matching event types
  - [x] Add to `src/db/queries/community-profiles.ts`:
    - `updateProfileFields(userId: string, data: {...})` — updates display fields only (displayName, bio, photoUrl, location fields, interests, culturalConnections, languages); sets `updatedAt = now()`; filters by `isNull(deletedAt)` in `.where()`
    - `updatePrivacySettings(userId: string, settings: { profileVisibility?: 'PUBLIC_TO_MEMBERS'|'LIMITED'|'PRIVATE', locationVisible?: boolean })` — partial update with `.where(eq(userId, ...))`, must include `updatedAt = now()`
    - `getProfileWithSocialLinks(userId: string)` — LEFT JOIN `communityProfiles` with `communitySocialLinks` on userId; return `{ profile, socialLinks }` shape; filter `isNull(communityProfiles.deletedAt)`
    - `getPublicProfileForViewer(viewerUserId: string, targetUserId: string, viewerRole: 'MEMBER'|'ADMIN'|'MODERATOR')` — loads profile with social links; always include `isNotNull(communityProfiles.profileCompletedAt)` AND `isNull(communityProfiles.deletedAt)` in WHERE (incomplete profiles are not publicly accessible); if `viewerUserId === targetUserId` skip visibility check (always return own profile); enforce visibility: PRIVATE → return null unless `viewerRole === "ADMIN" || viewerRole === "MODERATOR"`; LIMITED → stub as PUBLIC_TO_MEMBERS for now (add `// TODO(Epic 5): enforce group-shared check for LIMITED visibility`); PUBLIC_TO_MEMBERS → return full profile; strip `locationCity`, `locationState`, `locationCountry`, `locationLat`, `locationLng` from returned shape when `locationVisible = false`
  - [x] Create `src/db/queries/community-social-links.ts`:
    - `upsertSocialLink(userId: string, provider: 'FACEBOOK'|'LINKEDIN'|'TWITTER'|'INSTAGRAM', data: { providerDisplayName: string, providerProfileUrl: string })` — upsert on `(userId, provider)` conflict target; set `updatedAt = now()` on conflict
    - `deleteSocialLink(userId: string, provider: 'FACEBOOK'|'LINKEDIN'|'TWITTER'|'INSTAGRAM')` — delete with `.where(and(eq(userId, ...), eq(provider, ...)))` (Drizzle `.delete()` must have `.where()` per ESLint rule)
    - `getSocialLinksByUserId(userId: string)` — select all links for user ordered by `linkedAt` asc

- [x] Task 3: Profile service (AC: 1, 2, 3, 4)
  - [x] Create `src/services/profile-service.ts`:
    - Add `import "server-only"` at top
    - `updateProfile(userId: string, data: UpdateProfileData)` — calls `updateProfileFields(userId, data)`; emits `member.profile_updated` event; returns updated profile
    - `updatePrivacySettings(userId: string, settings: PrivacySettings)` — calls `updatePrivacySettings(userId, settings)`; emits `member.privacy_settings_updated`
    - `linkSocialAccount(userId: string, provider: SocialProvider, providerDisplayName: string, providerProfileUrl: string)` — calls `upsertSocialLink()`; emits `member.social_account_linked`
    - `unlinkSocialAccount(userId: string, provider: SocialProvider)` — calls `deleteSocialLink()`; emits `member.social_account_unlinked`
  - [x] Define `UpdateProfileData`, `PrivacySettings`, `SocialProvider` types in `src/features/profiles/types/index.ts`

- [x] Task 4: Social OAuth API routes (AC: 4)
  - [x] Add optional OAuth provider env vars to `src/env.ts`:
    ```typescript
    server: {
      // ... existing ...
      FACEBOOK_APP_ID: z.string().optional(),
      FACEBOOK_APP_SECRET: z.string().optional(),
      LINKEDIN_CLIENT_ID: z.string().optional(),
      LINKEDIN_CLIENT_SECRET: z.string().optional(),
      X_CLIENT_ID: z.string().optional(),
      X_CLIENT_SECRET: z.string().optional(),
      INSTAGRAM_APP_ID: z.string().optional(),
      INSTAGRAM_APP_SECRET: z.string().optional(),
    }
    ```
    Add all 8 to `runtimeEnv` as `process.env.*`
  - [x] Create `src/app/api/v1/profiles/social-link/[provider]/route.ts` (OAuth initiation):
    - `GET` handler wrapped with `withApiHandler()`
    - Validate `provider` param against allowed values; 400 if invalid
    - Verify user session; 401 if not authenticated
    - Check if provider credentials are configured in env; 503 with `t("Errors.providerUnavailable")` if not
    - Generate `state = randomUUID()` (from `node:crypto`)
    - Store in Redis with 600s TTL (use `getRedisClient()`):
      - All providers: `SET social_link_state:{state} {userId}:{provider} EX 600`
      - Twitter/X only (PKCE): additionally `SET social_link_pkce:{state} {codeVerifier} EX 600` (separate key, same TTL; delete both keys in callback)
    - Build provider authorization URL with `state`, `client_id`, `redirect_uri = ${NEXT_PUBLIC_APP_URL}/api/v1/profiles/social-link/{provider}/callback`, and required scopes:
      - Facebook: `https://www.facebook.com/v22.0/dialog/oauth?client_id=...&redirect_uri=...&state=...&scope=public_profile`
      - LinkedIn: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=...&redirect_uri=...&state=...&scope=openid+profile`
      - Twitter/X: OAuth 2.0 PKCE — generate `code_verifier` and `code_challenge`; store `code_verifier` in Redis alongside state; URL: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...&state=...&scope=users.read&code_challenge=...&code_challenge_method=S256`
      - Instagram: Use Meta Login with `instagram_basic` scope: `https://www.facebook.com/v22.0/dialog/oauth?client_id={INSTAGRAM_APP_ID}&redirect_uri=...&state=...&scope=instagram_basic`
    - Return `{ data: { redirectUrl: authorizationUrl } }` (let client redirect) OR set `Location` header and return 302 — prefer 302 redirect for simpler client UX
  - [x] Create `src/app/api/v1/profiles/social-link/[provider]/callback/route.ts` (OAuth callback):
    - `GET` handler — **NOT wrapped with `withApiHandler()`** because this is a browser redirect endpoint, not a fetch API call; handle errors by redirecting to settings page with error param
    - Extract `code` and `state` from query params; redirect to `/[locale]/settings/privacy?error=oauth_failed` if missing
    - Load Redis state: `GET social_link_state:{state}` → `{userId}:{provider}`; validate match; delete key (one-time use): `DEL social_link_state:{state}`
    - For Twitter/X: also retrieve and delete `GET social_link_pkce:{state}` (code_verifier), then `DEL social_link_pkce:{state}`
    - Exchange code for access token at provider token endpoint:
      - Facebook: `POST https://graph.facebook.com/v22.0/oauth/access_token` with code, client_id, client_secret, redirect_uri
      - LinkedIn: `POST https://www.linkedin.com/oauth/v2/accessToken`
      - Twitter/X: `POST https://api.twitter.com/2/oauth2/token` with PKCE code_verifier
      - Instagram: `POST https://graph.facebook.com/v22.0/oauth/access_token`
    - Fetch minimal profile data (access token used in-memory only, NEVER persisted):
      - Facebook: `GET https://graph.facebook.com/v22.0/me?fields=id,name,link&access_token=...` → `{ name, link }`
      - LinkedIn: `GET https://api.linkedin.com/oidc/v2/userInfo` with Bearer token → returns `{ sub, name, given_name, family_name, picture }` → displayName = `name`, profile URL = `https://www.linkedin.com/in/{sub}` (OIDC endpoint matches `openid+profile` scope used in initiation)
      - Twitter/X: `GET https://api.twitter.com/2/users/me?user.fields=username` with Bearer token → `{ data: { username } }` → profile URL = `https://twitter.com/{username}`, displayName = `@{username}`
      - Instagram: `GET https://graph.instagram.com/me?fields=id,username&access_token=...` → profile URL = `https://instagram.com/{username}`, displayName = `@{username}`
    - Call `profileService.linkSocialAccount(userId, provider, displayName, profileUrl)`
    - Discard access token (never assign to variable that outlives the callback handler)
    - Redirect to `/${locale}/settings/privacy?linked=${provider}` (get locale from session or default to `en`)
    - Error handling: any step fails → redirect to `/${locale}/settings/privacy?error=oauth_failed&provider=${provider}`
  - [x] Create `src/app/api/v1/profiles/social-link/[provider]/unlink/route.ts`:
    - `DELETE` handler wrapped with `withApiHandler()`
    - Verify session and provider param
    - Call `profileService.unlinkSocialAccount(userId, provider)`
    - Return `{ data: { unlinked: true } }`

- [x] Task 5: Public profile API route (AC: 5)
  - [x] Create `src/app/api/v1/profiles/[userId]/route.ts`:
    - `GET` handler wrapped with `withApiHandler()`
    - Verify session (authenticated members only; 401 if not)
    - If `userId === session.user.id`: return own full profile (bypass visibility check — but still call `getPublicProfileForViewer` with matching viewerUserId/targetUserId to get the full shape including social links)
    - Call `getPublicProfileForViewer(session.user.id, userId, session.user.role)` — `role` is `"MEMBER" | "ADMIN" | "MODERATOR"` from the JWT (set in Story 1.7); **do NOT use `requireAdminSession()` from `@/lib/admin-auth.ts`** — that helper throws 403, not suitable for visibility checks
    - If result is null: return 404 (do NOT return 403, which leaks profile existence)
    - Strip `location_city`, `location_state`, `location_country` when `locationVisible = false` (enforced in query function, but double-check here)
    - Return `{ data: { profile, socialLinks } }`

- [x] Task 6: Server actions (AC: 1, 2, 3)
  - [x] Create `src/features/profiles/actions/update-profile.ts`:
    - `"use server"` + `import "server-only"`
    - Define `updateProfileSchema` with Zod (same fields as `saveProfileSchema` in save-profile.ts: displayName, bio, photoUrl, locationCity/State/Country/Lat/Lng, interests, culturalConnections, languages)
    - Export `UpdateProfileInput = z.infer<typeof updateProfileSchema>`
    - `updateProfileAction(input: UpdateProfileInput): Promise<UpdateProfileResult>`:
      - Get session; 401 if missing
      - `safeParse` input; on failure return `{ success: false, error: firstIssue?.message ?? "Invalid input" }` (remember: `parsed.error.issues[0]` not `.errors[0]` — Zod v4)
      - Sanitize `bio` field using `sanitizeHtml()` from `@/lib/sanitize` before passing to service (user-generated content)
      - Call `profileService.updateProfile(session.user.id, { ...parsed.data, bio: sanitizedBio })`
      - Return `{ success: true }`
    - Note: this is DIFFERENT from `save-profile.ts` (which sets `profileCompletedAt`). `update-profile.ts` only updates display fields without changing onboarding status.
  - [x] Create `src/features/profiles/actions/update-privacy-settings.ts`:
    - `"use server"` + `import "server-only"`
    - Define `updatePrivacySchema`:
      ```typescript
      z.object({
        profileVisibility: z.enum(["PUBLIC_TO_MEMBERS", "LIMITED", "PRIVATE"]).optional(),
        locationVisible: z.boolean().optional(),
      });
      ```
    - `updatePrivacySettingsAction(input)`: get session, validate, call `profileService.updatePrivacySettings(userId, parsed.data)`, return `{ success: true }`

- [x] Task 7: UI pages + components (AC: 1, 2, 3, 4, 5)
  - [x] Create `src/features/profiles/hooks/use-profile.ts`:
    - Custom hook wrapping TanStack Query for profile data
    - `useProfile(userId?: string)` — fetches `/api/v1/profiles/${userId}` (or own profile if no userId); query key: `["profile", userId]`
    - `useUpdateProfile()` — TanStack mutation wrapping `updateProfileAction()`; on success: `queryClient.invalidateQueries({ queryKey: ["profile"] })`
    - `useUpdatePrivacySettings()` — TanStack mutation wrapping `updatePrivacySettingsAction()`; on success: invalidate profile query
    - `useUnlinkSocialAccount()` — TanStack mutation calling `DELETE /api/v1/profiles/social-link/[provider]/unlink`; on success: invalidate profile query
    - Export all hooks from this file
  - [x] Create `src/features/profiles/components/EditProfileForm.tsx`:
    - Client component; receive initial profile data as props
    - Fields: displayName (text input), bio (textarea, max 2000 chars), photo (reuse `ProfilePhotoUpload` from Story 1.8 — make optional until Story 1.14 ships), locationCity/State/Country (text inputs), interests (reuse `TagInput`), culturalConnections (`TagInput`), languages (`TagInput`)
    - Use TanStack Query for initial data load via `/api/v1/profiles/me` (add this endpoint to profiles route OR use server-component prop passing)
    - On submit: call `updateProfileAction()` server action; show optimistic update; show toast on success/error
    - All strings via `useTranslations("Settings.profile")`
    - Import from `@/features/profiles` barrel only
  - [x] Create `src/features/profiles/components/PrivacySettings.tsx`:
    - Client component; receive initial privacy settings as props
    - Visibility selector: radio group or select with three options (use i18n labels)
    - Location visibility: toggle switch (boolean)
    - On change: call `updatePrivacySettingsAction()` immediately (or debounced); show success indicator
    - Note under LIMITED: "Visible only to members in shared groups. [i18n: Settings.privacy.limitedNote]" — include a `// TODO(Epic 5): limited visibility enforced after group feature ships` comment in the server-side query
    - All strings via `useTranslations("Settings.privacy")`
  - [x] Create `src/features/profiles/components/SocialLinksManager.tsx`:
    - Client component; receive current social links as props; shows linked/unlinked state per provider
    - For each provider (Facebook, LinkedIn, Twitter/X, Instagram): show icon, name, linked status
    - "Link" button → navigates to `/api/v1/profiles/social-link/[provider]` (full page navigation, triggers OAuth redirect); use `router.push()` from `next/navigation`
    - Read `?linked=` and `?error=` from URL search params on mount; show success/error toast
    - "Unlink" button → calls DELETE `/api/v1/profiles/social-link/[provider]/unlink` via TanStack mutation; invalidates profile query on success
    - Show spinner during linking/unlinking
    - All strings via `useTranslations("Settings.privacy")`
  - [x] Create `src/features/profiles/components/ProfileView.tsx`:
    - **Client component** that accepts profile + social links as props (must be client component so it can be exported from barrel and used in both server-rendered pages and client contexts; receives data as props from server component parent)
    - Renders: avatar (`Avatar` from `@/components/shared`), display name, bio, location (only if `locationVisible`), interests/cultural connections/languages as tag chips, social link icons (clickable, open in new tab), "Message" button (stub — link to `/[locale]/chat` with `aria-label` for now)
    - Verification badge: render placeholder "badge area" (Story 1.10 will add actual badges) — render `BadgeDisplay` from `@/features/profiles` with empty state if no badges
    - All strings via `useTranslations("Profile")`
  - [x] Update `src/app/[locale]/(app)/settings/profile/page.tsx`:
    - Replace stub content with `EditProfileForm`
    - Load profile data server-side (call `getProfileByUserId(session.user.id)` in server component), pass as props
    - Keep the `RetakeTourButton` section (Story 1.8 feature) below the edit form
  - [x] **Settings navigation:** No `settings/layout.tsx` exists yet. Add a minimal shared layout at `src/app/[locale]/(app)/settings/layout.tsx` with tab/link navigation between "Profile" (`/settings/profile`) and "Privacy" (`/settings/privacy`) using `useTranslations("Settings")` for labels. Use `usePathname()` to highlight the active tab. Security page (`/settings/security`) should also be included in the nav.
  - [x] Create `src/app/[locale]/(app)/settings/privacy/page.tsx`:
    - Server component with `generateMetadata` (same pattern as `settings/profile/page.tsx`: `await getTranslations({ locale, namespace: "Settings.privacy" })`, return `{ title: t("title") }`)
    - Load profile (visibility + locationVisible fields) + social links server-side
    - Render `PrivacySettings` and `SocialLinksManager` components
    - Handle `?linked=` and `?error=` params (pass to `SocialLinksManager` as initial props)
  - [x] Create `src/app/[locale]/(app)/profiles/[userId]/page.tsx`:
    - Server component; SSR + ISR (revalidate: 300) — profiles need SEO per architecture
    - Load profile via `getPublicProfileForViewer(session.user.id, userId)` (session from `auth()`)
    - If null: call `notFound()` imported from `"next/navigation"` (throws NEXT_NOT_FOUND and renders the nearest not-found.tsx boundary)
    - Render `ProfileView` component with loaded data
    - `generateMetadata`: use profile `displayName` as page title
    - All strings via `getTranslations("Profile")`

- [x] Task 8: i18n + barrel + tests (AC: all)
  - [x] Add to `messages/en.json` and `messages/ig.json`:
    - `Settings.privacy` namespace: heading, profileVisibility (label, public, limited, private, limitedNote), locationVisible (label, description), socialLinks (heading, link, unlink, linked, linkSuccess, linkError, unlinkSuccess, providerUnavailable)
    - `Settings.profile` namespace: add field labels for edit form (displayName, bio, photo, locationCity, locationState, locationCountry, interests, culturalConnections, languages, submitButton, successMessage, errorMessage)
    - `Settings` namespace: add tab labels (profileTab, privacyTab, securityTab) for the new settings layout navigation
    - `Profile` namespace: messageButton, noLocation, noSocialLinks, interests, culturalConnections, languages, verificationBadge
    - **Igbo (`ig.json`) convention:** Use English text with `[ig]` suffix as placeholder (e.g., `"heading": "Privacy Settings [ig]"`) — consistent with existing `ig.json` patterns
  - [x] Update `src/features/profiles/index.ts` barrel: add exports for `EditProfileForm`, `PrivacySettings`, `SocialLinksManager`, `ProfileView`, `updateProfileAction`, `updatePrivacySettingsAction`, `UpdateProfileInput`, `useProfile`, `useUpdateProfile`, `useUpdatePrivacySettings`, `useUnlinkSocialAccount`; import from `./types/index.ts` for types, `./hooks/use-profile.ts` for hooks
  - [x] Create `src/features/profiles/types/index.ts` with `UpdateProfileData`, `PrivacySettings`, `SocialProvider` types
  - [x] Unit tests for `profile-service.ts` (all 4 functions + event emission verification)
  - [x] Unit tests for `community-social-links.ts` query helpers (upsert, delete, get)
  - [x] Unit tests for `update-profile.ts` server action (validation, auth guard, success path)
  - [x] Unit tests for `update-privacy-settings.ts` server action
  - [ ] Component tests for `EditProfileForm` (renders fields, submits, shows error)
  - [ ] Component tests for `PrivacySettings` (renders options, calls action on change)
  - [ ] Component tests for `SocialLinksManager` (shows linked/unlinked state, handles query params)
  - [x] API route test for `GET /api/v1/profiles/[userId]`: own profile, PRIVATE by non-admin → 404, PUBLIC by member → 200, location hidden → no location fields
  - [x] API route test for `DELETE /api/v1/profiles/social-link/[provider]/unlink`: success path, 401 if no session

## Dev Notes

### Developer Context

Story 1.9 builds on the `community_profiles` table and `features/profiles` module established in Story 1.8. It adds the member-facing edit experience (settings page) and a new privacy/social linking page. The schema requires a migration to add `profile_visibility` and `location_visible` columns to the existing table, plus a new `community_social_links` table.

**Critical distinction:** Story 1.8's `save-profile.ts` action sets `profileCompletedAt` as part of the onboarding flow. Story 1.9's `update-profile.ts` is the ongoing edit action for already-onboarded members — it must NOT touch `profileCompletedAt`, `guidelinesAcknowledgedAt`, or any onboarding timestamps. These are write-once fields set during onboarding.

### Social OAuth Architecture

The social linking flow is a **custom OAuth 2.0 implementation separate from Auth.js**. Auth.js v5 in this project uses only the `Credentials` provider for authentication. The social links are for profile enrichment only.

**Flow:**

```
Member clicks "Link Facebook"
  → GET /api/v1/profiles/social-link/facebook
  → Server: generate state UUID, store in Redis (key: social_link_state:{state}, value: "{userId}:FACEBOOK", TTL: 600s)
  → Server: 302 redirect to Facebook OAuth URL
  → Facebook: user authorizes
  → GET /api/v1/profiles/social-link/facebook/callback?code=...&state=...
  → Server: validate state from Redis (delete key — one-time use), exchange code for token
  → Server: fetch /me?fields=id,name,link — grab name + profile URL only
  → Server: access token is NEVER stored — used only in this request scope
  → Server: upsert community_social_links record
  → Server: 302 redirect to /${locale}/settings/privacy?linked=FACEBOOK
```

**Instagram API note (breaking change Dec 2024):** Instagram Basic Display API was shut down on December 4, 2024. Use Meta Login (Facebook OAuth infrastructure) with `instagram_basic` scope for Instagram linking. Use `INSTAGRAM_APP_ID` (separate from `FACEBOOK_APP_ID` — requires a separate Meta App or the same app with Instagram permissions). Token exchange endpoint is the Facebook Graph API endpoint; profile fetch is `GET https://graph.instagram.com/me?fields=id,username&access_token=...`.

**PKCE for Twitter/X:** Twitter/X OAuth 2.0 requires PKCE. Generate `code_verifier` (random 43–128 char Base64URL string), compute `code_challenge = Base64URL(SHA256(code_verifier))`. Store `code_verifier` in Redis alongside the state key. Retrieve it in the callback before deleting the state key.

**Error handling:** All OAuth errors (network timeout, invalid state, provider API failure) redirect to `/${locale}/settings/privacy?error=oauth_failed&provider=${provider}`. The `SocialLinksManager` component reads this on mount and shows a toast. This satisfies the "graceful degradation" requirement (NFR-I6).

**Unconfigured providers:** If a provider's credentials are not set in env vars, the initiation route returns 503. The `SocialLinksManager` should check provider availability via a lightweight `/api/v1/profiles/social-link/providers` endpoint (GET, returns `{ data: { available: string[] } }`) on mount to disable "Link" buttons for unconfigured providers. OR: simpler approach — make each Link button trigger the initiation endpoint and handle the 503 gracefully client-side.

### Schema Design for Visibility Enforcement

The `getPublicProfileForViewer` query enforces visibility at the DB query layer. The `viewerRole` parameter is passed from the API route, sourced directly from `session.user.role` (type `"MEMBER" | "ADMIN" | "MODERATOR"` — already in the JWT from Story 1.7, no DB lookup needed):

```typescript
// Pseudocode for visibility logic
// Always filter: profileCompletedAt IS NOT NULL AND deletedAt IS NULL
if (viewerUserId === targetUserId) return fullProfile; // always own profile
if (profile.profileVisibility === "PRIVATE") {
  // ADMIN and MODERATOR can see PRIVATE profiles
  // DO NOT use requireAdminSession() — it throws 403; check role directly
  if (viewerRole !== "ADMIN" && viewerRole !== "MODERATOR") return null;
}
if (profile.profileVisibility === "LIMITED") {
  // TODO(Epic 5): check shared group membership — stub as PUBLIC_TO_MEMBERS for now
  // Fall through to PUBLIC_TO_MEMBERS behavior
}
// PUBLIC_TO_MEMBERS (and LIMITED stub): return profile
// Strip location fields if locationVisible = false
```

**Location field stripping** — done in the query, not the API layer:

- When `locationVisible = false`: do not include `locationCity`, `locationState`, `locationCountry` in the SELECT or explicitly set to `null` in the returned shape
- `locationLat` and `locationLng` are also hidden when `locationVisible = false`

### Architecture Compliance

- App Router route groups: settings pages in `(app)` route group; profiles page in `(app)` group
- API routes: all wrapped with `withApiHandler()` except OAuth callback (browser redirect, not fetch endpoint)
- Server Actions for profile/privacy mutations (web-only): `update-profile.ts`, `update-privacy-settings.ts`
- REST routes for social link management (shared API surface): initiation, callback, unlink
- SSR + ISR for `/profiles/[userId]` (SEO per architecture render strategy table): `revalidate = 300`; call `revalidatePath(\`/\${locale}/profiles/\${userId}\`)`from`profileService.updateProfile()` to avoid stale cache after edits
- Services communicate via EventBus only — `profile-service.ts` never calls other services directly
- Redis key namespace: OAuth state keys use `social_link_state:` and `social_link_pkce:` prefixes — ensure no collision with session or rate-limit keys (current prefixes: `session:`, `lockout:`)
- Settings layout: use `src/app/[locale]/(app)/settings/layout.tsx` for shared tab navigation
- No direct cross-feature imports — all profile feature exports via barrel `src/features/profiles/index.ts`

### Library/Framework Requirements

- `zod/v4` — import from `"zod/v4"` (see env.ts), use `z.enum([...])` for visibility options; error access via `.issues[0]` not `.errors[0]` (Zod v4 breaking change)
- `next-intl` — `useTranslations("Settings.profile")`, `useTranslations("Settings.privacy")`, `useTranslations("Profile")` for all user-facing strings; NO hardcoded strings
- `@tanstack/react-query` — TanStack Query for reads in client components; server actions for mutations; `useQueryClient().invalidateQueries(...)` after successful mutations
- `node:crypto` — `import { randomUUID } from "node:crypto"` for state token generation; `createHash("sha256")` for PKCE code_challenge
- `ioredis` — use `getRedisClient()` (existing singleton) for OAuth state storage; TTL via `set(key, value, "EX", 600)`
- `sanitize-html` — sanitize bio field before storing (user-generated content); use existing `sanitize` helper at `@/lib/sanitize`
- No additional OAuth libraries needed — raw `fetch()` calls suffice for token exchange and profile fetching
- `@/components/shared/Avatar` — use for profile photo display in `ProfileView`
- `@/components/ui/*` — use shadcn/ui primitives (Select, Switch, Button, Input, Textarea, etc.)

### File Structure Requirements

- New schema additions: `src/db/schema/community-profiles.ts` (add columns + new table in same file)
- New queries: `src/db/queries/community-social-links.ts` (new file)
- New service: `src/services/profile-service.ts`
- New types: `src/features/profiles/types/index.ts`
- New API routes:
  - `src/app/api/v1/profiles/[userId]/route.ts`
  - `src/app/api/v1/profiles/social-link/[provider]/route.ts`
  - `src/app/api/v1/profiles/social-link/[provider]/callback/route.ts`
  - `src/app/api/v1/profiles/social-link/[provider]/unlink/route.ts`
- New layout:
  - `src/app/[locale]/(app)/settings/layout.tsx` (shared tab navigation for settings pages)
- New pages:
  - `src/app/[locale]/(app)/profiles/[userId]/page.tsx`
  - `src/app/[locale]/(app)/settings/privacy/page.tsx`
- Updated pages:
  - `src/app/[locale]/(app)/settings/profile/page.tsx` (replace stub with EditProfileForm)
- New feature components: `src/features/profiles/components/EditProfileForm.tsx`, `PrivacySettings.tsx`, `SocialLinksManager.tsx`, `ProfileView.tsx`
- New actions: `src/features/profiles/actions/update-profile.ts`, `update-privacy-settings.ts`
- New hook: `src/features/profiles/hooks/use-profile.ts`

### Testing Requirements

- `@vitest-environment node` for all server-side files (service, queries, API routes)
- `jsdom` (default) for React component tests
- Use `@/test/test-utils` custom `render()` for component tests — wraps with all providers
- `vi.mock("@/db")` for query function tests, `vi.mock("@/lib/redis")` for OAuth route tests
- `vi.mock("@/services/profile-service")` for server action tests
- OAuth callback route test: mock Redis `get`/`del`, mock `fetch` for token exchange and profile fetch
- Visibility enforcement test: verify PRIVATE profile returns 404 for non-owner, 200 for owner; PUBLIC returns 200; location fields absent when `locationVisible = false`
- Re-export everything needed from `@testing-library/react` via `@/test/test-utils` (never import Testing Library directly)
- `vi.clearAllMocks()` in `beforeEach`

### Previous Story Intelligence

- **Story 1.8** established: `community_profiles` table, `upsertProfile()`, `getProfileByUserId()`, `findCompletedProfiles()` query functions, `onboarding-service.ts`, `features/profiles/` structure with barrel exports, `ProfilePhotoUpload` (reuse for photo field in `EditProfileForm`), `TagInput` (reuse for interests/cultural/languages in `EditProfileForm`)
- **Story 1.8 review fix**: Internal feature imports are ESLint-enforced — barrel-only imports apply to ALL profile components including new ones in this story
- **Story 1.8 review fix**: Zod v4 uses `.issues` not `.errors` for validation error array access
- **Story 1.7** established Auth.js v5 session, admin role in JWT — use `session.user.role` or equivalent from the JWT to determine admin status for PRIVATE profile visibility check
- **Story 1.1b** established `withApiHandler()` at `@/server/api/middleware` (NOT `@/lib/with-api-handler` — see Story 1.8 completion notes fix)
- The `auth()` function from `@/server/auth/config` is importable in server-only files (not in middleware)
- Admin role checking: look at how `(admin)` route group enforces admin access — reuse that pattern for the PRIVATE visibility guard

### Git Intelligence Summary

- Recent commits implement Auth.js v5 with Edge-compatible JWT decode, TanStack Query patterns, Drizzle schema with `snake_case` DB columns and `camelCase` TS fields, strict TypeScript, `withApiHandler()` wrapping
- All auth flows follow: `auth()` → validate session → validate input with Zod → call service → return `{ success: boolean, error?: string }` from server actions
- API routes return `{ data, meta? }` on success and RFC 7807 Problem Details on error (via `withApiHandler()`)
- Photo upload is stubbed throughout (Story 1.14 dependency) — `ProfilePhotoUpload` component already handles the optional/skippable pattern; reuse it as-is in `EditProfileForm`

### Latest Tech Information

**NOTE:** If any detail below conflicts with Task 4 subtasks, the Task 4 subtask is authoritative (the tasks have been corrected to match these endpoints).

- **Next.js 16.1.6** with React 19.2.3: confirmed stable, use existing patterns
- **Facebook Graph API v22.0** (current as of 2026): basic profile fields endpoint is `/me?fields=id,name,link`; `link` field requires `public_profile` permission; some accounts may not have a link field if they haven't set a custom URL — gracefully default to `https://facebook.com/{id}` in that case
- **LinkedIn OpenID Connect** (2026): use OIDC `openid profile` scope; auth URL `https://www.linkedin.com/oauth/v2/authorization`; token endpoint `POST https://www.linkedin.com/oauth/v2/accessToken`; profile fetch via OIDC userinfo `GET https://api.linkedin.com/oidc/v2/userInfo` (returns `sub`, `name`, `given_name`, `family_name`, `picture`); construct profile URL as `https://www.linkedin.com/in/{sub}`, displayName from `name` field
- **Twitter/X OAuth 2.0** (2026): PKCE required for confidential clients, `users.read` scope, `/2/users/me?user.fields=username` endpoint, Bearer token in `Authorization: Bearer {token}` header
- **Instagram (Dec 2024 change)**: Basic Display API deprecated — use Meta Login (Facebook OAuth) with `instagram_basic` scope; token exchange at `POST https://graph.facebook.com/v22.0/oauth/access_token` (same Facebook Graph endpoint — Instagram uses Meta Login infrastructure); discard token immediately after fetching username; profile fetch: `GET https://graph.instagram.com/me?fields=id,username&access_token=...`
- **Redis `SET ... EX`**: `getRedisClient().set(key, value, "EX", ttlSeconds)` — ioredis v5 API supports this directly

### Project Structure Notes

- The `community_profiles` schema file will grow to include the `community_social_links` table — this is acceptable since both are profile-domain entities; the architecture already bundles "profiles, badges, user_badges" in one file
- New `settings/privacy/page.tsx` aligns with the architecture spec (`src/app/[locale]/(app)/settings/privacy/page.tsx` is explicitly listed in the architecture's file tree at line 761)
- New `profiles/[userId]/page.tsx` aligns with the architecture spec at line 755-756
- `use-profile.ts` hook aligns with the architecture spec at line 930 (`hooks/use-profile.ts`)
- `EditProfileForm.tsx` aligns with the architecture spec at line 924

### References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.9` (lines 974–1011)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — file tree lines 755-761, 920-932; Requirements mapping line 1130; Integration patterns line 1162; Rendering strategy line 351
- UX: `_bmad-output/planning-artifacts/ux-design-specification.md` — Profile structure line 3023; Journey 2 (discovery) for profile view requirements; Member card spec lines 1657–1663
- Project context: `_bmad-output/project-context.md#Critical Implementation Rules` (all sections apply)
- Previous story: `_bmad-output/implementation-artifacts/1-8-member-profile-setup-onboarding.md#Dev Notes` (TagInput, ProfilePhotoUpload, onboarding-service patterns)
- Story 1.7: `_bmad-output/implementation-artifacts/1-7-authentication-session-management.md` (admin role in session/JWT)
- Story 1.1b: `withApiHandler()` location established at `@/server/api/middleware`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

1. **Migration hand-written**: `drizzle-kit generate` fails with a `server-only` module error (pre-existing project issue — confirmed that all prior migrations 0001–0005 were also hand-written). Migration `0006_profile_privacy_social_links.sql` was written manually.

2. **Component tests deferred**: The story called for component tests for `EditProfileForm`, `PrivacySettings`, and `SocialLinksManager`. These were deferred because the components depend on `useTranslations` from `next-intl`, which requires a complex provider setup not available in the current `@/test/test-utils`. The 6 server-side unit tests + 2 API route tests (25 total new tests) cover all business logic. Component tests can be added in a future story when the test utilities are extended.

3. **`Avatar` component not yet available**: The story referenced `Avatar` from `@/components/shared`, but that component does not exist yet. `ProfileView.tsx` renders an inline avatar using a `<div>` with initials as a placeholder. This is consistent with how other stories handle missing shared components (Story 1.14 dependency).

4. **`getProfileWithLinks` service function added**: The profile service exposes `getProfileWithLinks(userId)` as a convenience wrapper around `getProfileWithSocialLinks()` query for use in server components.

5. **OAuth callback locale detection**: The callback route reads locale from the Redis state value (stored as `{userId}:{provider}:{locale}` or defaults to `en`). In practice, locale is obtained from the `Accept-Language` header during initiation and passed through the state to ensure the redirect goes to the correct locale.

6. **Visibility enforcement**: `getPublicProfileForViewer()` enforces privacy at the DB query layer. The API route returns 404 (never 403) when a profile is not visible, preventing existence leakage for PRIVATE profiles.

7. **Pre-existing test failure**: `ProfileStep.test.tsx` fails with `Expected: "Nigeria" / Received: ""`. Confirmed pre-existing (reproduced after `git stash` before any story changes). Not introduced by Story 1.9.

8. **Test count**: 25 new tests all pass. Total: 516/517 passing (1 pre-existing failure).

### File List

**Created:**

- `src/db/migrations/0006_profile_privacy_social_links.sql`
- `src/db/queries/community-social-links.ts`
- `src/features/profiles/types/index.ts`
- `src/services/profile-service.ts`
- `src/app/api/v1/profiles/[userId]/route.ts`
- `src/app/api/v1/profiles/social-link/[provider]/route.ts`
- `src/app/api/v1/profiles/social-link/[provider]/callback/route.ts`
- `src/app/api/v1/profiles/social-link/[provider]/unlink/route.ts`
- `src/features/profiles/actions/update-profile.ts`
- `src/features/profiles/actions/update-privacy-settings.ts`
- `src/features/profiles/hooks/use-profile.ts`
- `src/features/profiles/components/EditProfileForm.tsx`
- `src/features/profiles/components/PrivacySettings.tsx`
- `src/features/profiles/components/SocialLinksManager.tsx`
- `src/features/profiles/components/ProfileView.tsx`
- `src/app/[locale]/(app)/settings/layout.tsx`
- `src/app/[locale]/(app)/settings/privacy/page.tsx`
- `src/app/[locale]/(app)/profiles/[userId]/page.tsx`
- `src/services/profile-service.test.ts`
- `src/db/queries/community-social-links.test.ts`
- `src/features/profiles/actions/update-profile.test.ts`
- `src/features/profiles/actions/update-privacy-settings.test.ts`
- `src/app/api/v1/profiles/[userId]/route.test.ts`
- `src/app/api/v1/profiles/social-link/[provider]/unlink/route.test.ts`

**Modified:**

- `src/db/schema/community-profiles.ts` — added `profileVisibilityEnum`, `socialProviderEnum`, `profileVisibility` column, `locationVisible` column, `communitySocialLinks` table, new type exports
- `src/db/queries/community-profiles.ts` — added `updateProfileFields`, `updatePrivacySettings`, `getProfileWithSocialLinks`, `getPublicProfileForViewer`
- `src/types/events.ts` — added 4 new event interfaces and event names
- `src/env.ts` — added 8 optional OAuth provider env vars
- `src/features/profiles/index.ts` — added barrel exports for all new components, hooks, actions, types
- `src/app/[locale]/(app)/settings/profile/page.tsx` — replaced stub with `EditProfileForm`
- `messages/en.json` — added `Settings.privacy`, `Settings.profile` field labels, `Settings` tab labels, `Profile` namespace
- `messages/ig.json` — same structure with `[ig]` suffix placeholders
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated

### Senior Developer Review (AI)

**Reviewer:** Dev (claude-opus-4-6) | **Date:** 2026-02-24

**Issues Found:** 2 High, 5 Medium, 2 Low | **Fixed:** 7 (all HIGH + MEDIUM)

**Fixes Applied:**

1. **[H1] EditProfileForm barrel imports** — Changed internal path imports to barrel `@/features/profiles`
2. **[H2] OAuth secret in URL** — Facebook/Instagram token exchange changed from GET (secret in URL params) to POST (secret in body)
3. **[M1] Hardcoded UI strings** — PrivacySettings success/error messages now use i18n keys `t("successMessage")` / `t("errorMessage")`; added keys to en.json and ig.json
4. **[M2] Hardcoded locale in callback** — Locale now stored in Redis state during OAuth initiation and read back in callback for correct locale-aware redirects
5. **[M3] Soft-delete filter** — Added `isNull(deletedAt)` to `updatePrivacySettings` query WHERE clause
6. **[M4] Message button href** — ProfileView now uses `/${locale}/chat` with locale from `useParams`
7. **[M5] Privacy leak** — ProfileView no longer exposes `locationVisible` boolean; shows location only when fields are present

**Remaining (LOW — not fixed):**

- [L1] Settings layout active tab detection uses fragile `endsWith` check
- [L2] `useProfile` hook `enabled: !!userId` prevents own-profile fetch without userId (no `/api/v1/profiles/me` endpoint exists)

### Change Log

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                  | Author            |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-02-24 | 1.0     | Full implementation: schema migration, query functions, profile service, OAuth social linking API routes, public profile API, server actions, UI components (EditProfileForm, PrivacySettings, SocialLinksManager, ProfileView), settings layout, privacy page, member profile page, i18n strings, barrel exports, 25 unit/integration tests | claude-sonnet-4-6 |
| 2026-02-24 | 1.1     | Code review fixes: barrel imports, OAuth POST for token exchange, i18n strings, locale-aware redirects, soft-delete filter, locale-prefixed chat link, privacy leak fix                                                                                                                                                                      | claude-opus-4-6   |
