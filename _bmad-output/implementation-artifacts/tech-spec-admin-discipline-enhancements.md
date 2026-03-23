---
title: 'Admin Discipline Management Enhancements'
slug: 'admin-discipline-enhancements'
created: '2026-03-23'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [Next.js 16.1.x, TypeScript strict, Drizzle ORM, PostgreSQL, React Query, shadcn/ui, next-intl, Auth.js v5]
files_to_modify:
  - src/db/queries/member-discipline.ts
  - src/db/queries/posts.ts
  - src/db/queries/moderation.ts
  - src/services/member-discipline-service.ts
  - src/services/notification-service.ts
  - src/templates/email/discipline-suspension-lifted.ts (NEW)
  - src/app/api/v1/admin/discipline/[userId]/route.ts (NEW)
  - src/app/api/v1/admin/discipline/[userId]/lift/route.ts (NEW)
  - src/app/[locale]/(admin)/admin/moderation/members/[userId]/page.tsx (NEW)
  - src/features/admin/components/MemberDisciplineHistory.tsx (NEW)
  - src/features/admin/components/LiftSuspensionDialog.tsx (NEW)
  - src/features/admin/components/ModerationQueue.tsx
  - src/features/admin/components/ModerationActionDialog.tsx
  - src/app/api/v1/admin/moderation/[actionId]/route.ts
  - messages/en.json
  - messages/ig.json
code_patterns:
  - withApiHandler + requireAdminSession for admin routes
  - Extract dynamic params from URL pathname (not Next.js route params)
  - eventBus.emit for notifications
  - logAdminAction for audit trail
  - successResponse/errorResponse with RFC 7807
  - React Query useQuery/useMutation for data fetching
  - db.transaction() for multi-table atomic updates
test_patterns:
  - Co-located test files (*.test.ts next to source)
  - '@vitest-environment node' for server files
  - vi.mock for DB queries and services
  - db.execute mock returns raw array
---

# Tech-Spec: Admin Discipline Management Enhancements

**Created:** 2026-03-23

## Overview

### Problem Statement

Admins have no way to (1) lift a suspension early, (2) view a member's full discipline history before taking action, or (3) see the actual content of a flagged item when `contentPreview` is null — the "View content" link navigates to the public feed page showing all posts instead of the specific flagged content.

### Solution

- Add a **Member Discipline History page** (`/admin/moderation/members/[userId]`) showing full discipline history + active suspension with a "Lift Early" button
- Link to this page from the moderation queue (Author column)
- Fix "View content" to fetch and display the single content item inline instead of navigating to the public feed
- Send notification + email on early lift, log audit trail with required reason

### Scope

**In Scope:**

1. Member discipline history standalone page (all actions, not just last 3)
2. Lift suspension early — API route + UI button + audit log + notification + email
3. Fix "View content" link to show single content inline (fetch + expand)
4. Link from moderation queue Author column to discipline history page

**Out of Scope:**

- User-initiated appeals
- Auto-escalation (N warnings → auto-suspend)
- Comment/member report types in moderation queue
- Re-scan on content edit

## Context for Development

### Codebase Patterns

- **Admin routes**: Always `withApiHandler()` + `requireAdminSession()`. Dynamic params extracted from `new URL(req.url).pathname.split("/").at(-N)`.
- **Discipline service**: `member-discipline-service.ts` exports `issueWarning`, `issueSuspension`, `issueBan`, `liftExpiredSuspensions`. New `liftSuspensionEarly` function follows same pattern but uses `db.transaction()` for atomic status + discipline update.
- **Event bus**: `account.discipline_issued` and `account.status_changed` events drive notifications. Note: `account.discipline_issued` is NOT in typed `EventMap` — uses inline types in notification-service handler.
- **Audit logger**: `logAdminAction({ actorId, action, targetUserId, details })` — new action type: `LIFT_SUSPENSION_EARLY`.
- **Email templates**: Located in `src/templates/email/`, export `render(data, locale)` → `{ subject, html, text }`. Bilingual (en/ig).
- **Moderation queue**: `ModerationQueue.tsx` uses React Query to fetch from `/api/v1/admin/moderation`. When `contentPreview` is null, currently links to public `/feed#post-{id}` — this is the bug.
- **Existing query**: `getPostContent(postId)` returns Tiptap JSON string but filters `deletedAt IS NULL` — for moderation, we need content even if soft-deleted. Also `getArticleByIdForAdmin` has no deletedAt filter (works as-is).
- **i18n**: All strings via `useTranslations()` / `getTranslations()` — no hardcoded strings.
- **DB schema**: `member_discipline_actions` already has `liftedAt`, `liftedBy`, `status: 'lifted'` fields. `expireDisciplineAction(id, liftedBy?)` already supports manual lifting (passing `liftedBy` sets status to `lifted` vs `expired`).

### Files to Reference

| File                                                       | Purpose                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------- |
| `src/db/queries/member-discipline.ts`                      | Discipline CRUD: `createDisciplineAction`, `listMemberDisciplineHistory`, `getActiveSuspension`, `expireDisciplineAction`. Note: `listMemberDisciplineHistory` currently returns raw columns with `issuedBy`/`liftedBy` as UUIDs — needs LEFT JOIN enrichment for names. |
| `src/db/queries/posts.ts`                                  | `getPostContent(postId)` — returns Tiptap JSON (filters deleted), `softDeletePostByModeration`                                                                                                                                                                           |
| `src/db/queries/articles.ts`                               | `getArticleByIdForAdmin(articleId)` — returns full article (no deleted filter)                                                                                                                                                                                           |
| `src/db/queries/moderation.ts`                             | `getModerationActionById`, `listFlaggedContent`, `ModerationQueueItem` interface                                                                                                                                                                                         |
| `src/services/member-discipline-service.ts`                | `issueWarning`, `issueSuspension`, `issueBan`, `liftExpiredSuspensions` + `evictUserSessions` helper                                                                                                                                                                     |
| `src/services/notification-service.ts`                     | Handlers for `account.discipline_issued` and `account.status_changed` events                                                                                                                                                                                             |
| `src/templates/email/discipline-suspension.ts`             | Suspension email template (bilingual) — reference for "lifted" template                                                                                                                                                                                                  |
| `src/app/api/v1/admin/moderation/[actionId]/route.ts`      | Existing moderation action GET/PATCH route — includes `listMemberDisciplineHistory` in response                                                                                                                                                                          |
| `src/features/admin/components/ModerationQueue.tsx`        | Queue table with "View content" link bug (lines 233-247)                                                                                                                                                                                                                 |
| `src/features/admin/components/ModerationActionDialog.tsx` | Dialog showing last 3 discipline records — link to full history page                                                                                                                                                                                                     |
| `src/app/[locale]/(admin)/admin/moderation/page.tsx`       | Moderation page Server Component                                                                                                                                                                                                                                         |
| `src/lib/admin-auth.ts`                                    | `requireAdminSession()` returns `{ adminId }`                                                                                                                                                                                                                            |
| `src/lib/api-response.ts`                                  | `successResponse()`, `errorResponse()`                                                                                                                                                                                                                                   |
| `src/lib/api-error.ts`                                     | `ApiError` class                                                                                                                                                                                                                                                         |
| `src/services/audit-logger.ts`                             | `logAdminAction()`                                                                                                                                                                                                                                                       |
| `src/services/event-bus.ts`                                | Typed `eventBus.emit()` / `eventBus.on()`                                                                                                                                                                                                                                |
| `src/db/schema/member-discipline.ts`                       | Schema: `member_discipline_actions` with `liftedAt`, `liftedBy`, status enum `active                                                                                                                                                                                     | expired | lifted` |

### Technical Decisions

1. **No new migration needed**: DB schema already has `liftedAt`, `liftedBy`, and `status: 'lifted'` on `member_discipline_actions`. `expireDisciplineAction(id, liftedBy)` already handles the "lifted" status path.

2. **New service function `liftSuspensionEarly`**: Uses `db.transaction()` to atomically: verify user is SUSPENDED, update `accountStatus` to APPROVED, mark discipline action as `lifted`. Events and audit logging happen OUTSIDE the transaction (side effects, not data integrity). Re-checks current user status (never overwrites BANNED/PENDING_DELETION/ANONYMIZED).

3. **Idempotent lift**: If suspension is already `lifted` or `expired`, return 409 Conflict (not 500). Race condition with auto-lift job is safe because `expireDisciplineAction` is a simple UPDATE with no precondition check.

4. **View content fix — enrich existing detail endpoint**: Add `contentBody` field to the existing `GET /api/v1/admin/moderation/[actionId]` response instead of creating a new route. For posts, use new `getPostContentForModeration` (no deletedAt filter). For articles, use existing `getArticleByIdForAdmin`. For messages, `contentPreview` already contains the text. In `ModerationQueue.tsx`, replace the `<a>` link with a button that fetches the detail endpoint and shows content inline in an expandable row. React Query caches the response so subsequent opens are instant.

5. **New query `getPostContentForModeration`**: Same as `getPostContent` but WITHOUT the `deletedAt IS NULL` filter — moderators need to see removed content.

6. **Author link with discipline badge**: In `ModerationQueue.tsx`, the Author column becomes a link to `/admin/moderation/members/[userId]`. If `disciplineCount > 0`, show a small badge `(N)` next to the name.

7. **Email for early lift**: New template `discipline-suspension-lifted.ts` — bilingual, informs the member their suspension was lifted early by an admin with reason.

8. **Notification event**: New `account.discipline_lifted` event emitted from `liftSuspensionEarly`. Notification-service handler sends in-app notification + email using the new template. Same self-notification pattern (actorId = userId) so block/mute filters don't suppress.

9. **Enrich `listMemberDisciplineHistory` with names**: The current query returns `issuedBy` and `liftedBy` as raw UUIDs. Add LEFT JOINs to `auth_users` (aliased as `issuer` and `lifter`) to include `issuedByName` and `liftedByName` in the result. This enrichment flows automatically to the existing `GET /api/v1/admin/moderation/[actionId]` response (which already calls this query) and the new discipline GET route.

10. **Fetch community profile display name**: The `GET /admin/discipline/[userId]` route should also fetch the member's `displayName` from `community_profiles` (via existing `getCommunityProfileByUserId` or similar query) for the page header. Fall back to `auth_users.name` if no community profile exists.

## Implementation Plan

### Tasks

- [x] Task 1: Add `getPostContentForModeration` query + enrich `listMemberDisciplineHistory` + i18n keys
  - File: `src/db/queries/posts.ts`
  - Action: Add new function `getPostContentForModeration(postId: string): Promise<string | null>` — same as `getPostContent` but without the `deletedAt IS NULL` filter. Returns Tiptap JSON string for any post (including soft-deleted).
  - File: `src/db/queries/member-discipline.ts`
  - Action: Enrich `listMemberDisciplineHistory` to LEFT JOIN `auth_users` twice (aliased as `issuer` and `lifter`) to resolve `issuedBy`/`liftedBy` UUIDs to names:

    ```
    import { alias } from "drizzle-orm/pg-core";
    import { getTableColumns } from "drizzle-orm";
    const issuerAlias = alias(authUsers, "issuer");
    const lifterAlias = alias(authUsers, "lifter");

    return db
      .select({
        ...getTableColumns(memberDisciplineActions),
        issuedByName: issuerAlias.name,
        liftedByName: lifterAlias.name,
      })
      .from(memberDisciplineActions)
      .leftJoin(issuerAlias, eq(memberDisciplineActions.issuedBy, issuerAlias.id))
      .leftJoin(lifterAlias, eq(memberDisciplineActions.liftedBy, lifterAlias.id))
      .where(eq(memberDisciplineActions.userId, userId))
      .orderBy(desc(memberDisciplineActions.createdAt));
    ```

    This enrichment automatically flows to the existing `GET /api/v1/admin/moderation/[actionId]` response and the new discipline routes.

  - File: `messages/en.json`, `messages/ig.json`
  - Action: Add all new i18n keys under `Admin.moderation.*` and `Admin.discipline.*`:
    - `Admin.discipline.title` — "Member Discipline History" / "Akụkọ Ntụziaka Onye Otu"
    - `Admin.discipline.activeSuspension` — "Active Suspension"
    - `Admin.discipline.endsAt` — "Ends: {date}"
    - `Admin.discipline.remaining` — "({days} days remaining)"
    - `Admin.discipline.issuedBy` — "Issued by: {name}"
    - `Admin.discipline.liftEarly` — "Lift Suspension Early"
    - `Admin.discipline.liftReason` — "Reason for lifting"
    - `Admin.discipline.liftReasonRequired` — "A reason is required"
    - `Admin.discipline.liftConfirmMessage` — "This will restore the member's account to APPROVED status immediately."
    - `Admin.discipline.liftSuccess` — "Suspension lifted successfully"
    - `Admin.discipline.historyCount` — "Discipline History ({count} actions)"
    - `Admin.discipline.noHistory` — "No discipline history"
    - `Admin.discipline.status.active` — "Active"
    - `Admin.discipline.status.expired` — "Expired"
    - `Admin.discipline.status.lifted` — "Lifted"
    - `Admin.discipline.backToQueue` — "Back to Moderation Queue"
    - `Admin.discipline.memberStatus` — "Account Status: {status}"
    - `Admin.moderation.viewContentExpand` — "View content"
    - `Admin.moderation.hideContent` — "Hide content"
    - `Admin.moderation.contentUnavailable` — "Content unavailable"
    - `Admin.moderation.discipline.viewFullHistory` — "View full history"
  - Notes: Follow existing key naming patterns. Igbo translations required for all keys.

- [x] Task 2: Add `contentBody` to moderation detail endpoint
  - File: `src/app/api/v1/admin/moderation/[actionId]/route.ts`
  - Action: In the `GET` handler, after fetching the moderation action item, also fetch the content body:
    - If `contentType === "post"`: call `getPostContentForModeration(item.contentId)` → convert Tiptap JSON to plain text using the existing `tiptapToPlainText` helper from `src/lib/moderation-scanner.ts`
    - If `contentType === "article"`: call `getArticleByIdForAdmin(item.contentId)` → use `article.title + "\n\n" + tiptapToPlainText(article.contentEn)`
    - If `contentType === "message"`: use `item.contentPreview` (already plain text)
    - Add `contentBody: string | null` to the response: `successResponse({ action: item, disciplineHistory, contentBody })`
  - Notes: Import `getPostContentForModeration` from `@/db/queries/posts`, `getArticleByIdForAdmin` from `@/db/queries/articles`, and `tiptapToPlainText` from `@/lib/moderation-scanner`. Wrap the content fetch in try/catch — if content is truly gone, return `contentBody: null`.

- [x] Task 3: Add `liftSuspensionEarly` service function
  - File: `src/services/member-discipline-service.ts`
  - Action: Add new exported function:
    ```
    export async function liftSuspensionEarly(params: {
      suspensionId: string;
      adminId: string;
      reason: string;
    }): Promise<void>
    ```
    Implementation:
    1. Fetch the discipline action by ID — verify it exists, is a suspension, and has `status === "active"`. If not found → throw `ApiError 404`. If not active → throw `ApiError 409` ("Suspension already lifted or expired").
    2. Fetch current user via `findUserById(suspension.userId)`. Verify `accountStatus === "SUSPENDED"`. If BANNED/PENDING_DELETION/ANONYMIZED → throw `ApiError 409` ("Cannot lift: account status is {status}").
    3. Inside `db.transaction(async (tx) => { ... })`:
       - `tx.update(authUsers).set({ accountStatus: "APPROVED", updatedAt: new Date() }).where(eq(authUsers.id, suspension.userId))`
       - `tx.update(memberDisciplineActions).set({ status: "lifted", liftedAt: new Date(), liftedBy: params.adminId }).where(eq(memberDisciplineActions.id, params.suspensionId))`
    4. Outside transaction:
       - `logAdminAction({ actorId: params.adminId, action: "LIFT_SUSPENSION_EARLY", targetUserId: suspension.userId, details: { disciplineId: params.suspensionId, reason: params.reason } })`
       - `eventBus.emit("account.status_changed", { userId: suspension.userId, newStatus: "APPROVED", oldStatus: "SUSPENDED", timestamp: new Date().toISOString() })`
       - `eventBus.emit("account.discipline_lifted", { userId: suspension.userId, disciplineId: params.suspensionId, reason: params.reason, liftedBy: params.adminId, timestamp: new Date().toISOString() })`
  - Notes: Import `db` from `@/db` and `memberDisciplineActions` from schema for the in-transaction update. Do NOT use `expireDisciplineAction` inside the transaction — it uses the global `db`, not the transaction `tx`. Instead, inline the update.

- [x] Task 4: Create email template for suspension lifted
  - File: `src/templates/email/discipline-suspension-lifted.ts` (NEW)
  - Action: Create bilingual email template following the pattern of `discipline-suspension.ts`:
    - English subject: "Your OBIGBO account suspension has been lifted"
    - Igbo subject: "Emepela imechi akaụntụ OBIGBO gị"
    - Body: Greeting, "Your suspension has been lifted early by our moderation team.", Reason blockquote, "You can now access the platform again.", Support contact.
    - Export `render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult`
  - Notes: Data fields: `name`, `reason`. Follow exact HTML structure from `discipline-suspension.ts` (renderBase, escHtml imports).

- [x] Task 5: Add notification handler for `account.discipline_lifted`
  - File: `src/services/notification-service.ts`
  - Action: Add new event handler after the `account.discipline_issued` handler block (~line 640):
    ```
    eventBus.on("account.discipline_lifted", async (payload: {
      userId: string;
      disciplineId: string;
      reason: string;
      liftedBy: string;
      timestamp: string;
    }) => {
      await deliverNotification({
        userId: payload.userId,
        actorId: payload.userId, // self-notification pattern
        type: "admin_announcement",
        title: "notifications.discipline.lifted.title",
        body: "notifications.discipline.lifted.body",
        link: "/dashboard",
        emailData: {
          templateId: "discipline-suspension-lifted",
          reason: payload.reason,
        },
      });
    });
    ```
  - Notes: Add i18n keys `notifications.discipline.lifted.title` ("Suspension Lifted") and `notifications.discipline.lifted.body` ("Your account suspension has been lifted early") to `messages/en.json` and `messages/ig.json`.

- [x] Task 6: Create admin discipline API routes
  - File: `src/app/api/v1/admin/discipline/[userId]/route.ts` (NEW)
  - Action: Create GET route to fetch a member's discipline history + current account status:
    - `withApiHandler(async (request) => { ... })`
    - `await requireAdminSession(request)`
    - Extract `userId` from URL: `new URL(request.url).pathname.split("/").at(-1)`
    - Validate UUID format
    - Fetch user via `findUserById(userId)` — 404 if not found
    - Fetch discipline history via `listMemberDisciplineHistory(userId)` (now includes `issuedByName` and `liftedByName`)
    - Fetch active suspension via `getActiveSuspension(userId)`
    - Fetch community profile display name (e.g., via `getCommunityProfileByUserId(userId)` or direct query on `community_profiles`). Fall back to `auth_users.name` if no community profile exists.
    - Return `successResponse({ user: { id, name, displayName, email, accountStatus }, disciplineHistory, activeSuspension })`
  - File: `src/app/api/v1/admin/discipline/[userId]/lift/route.ts` (NEW)
  - Action: Create POST route to lift a suspension early:
    - `withApiHandler(async (request) => { ... })`
    - `const { adminId } = await requireAdminSession(request)`
    - Extract `userId` from URL: `new URL(request.url).pathname.split("/").at(-2)` (path: `/admin/discipline/{userId}/lift`)
    - Parse body with Zod schema: `z.object({ suspensionId: z.string().uuid(), reason: z.string().min(1) })`
    - Verify the suspension's `userId` matches the URL `userId` — 400 if mismatch
    - Call `liftSuspensionEarly({ suspensionId, adminId, reason })`
    - Return `successResponse({ lifted: true }, undefined, 200)`
  - Notes: Both routes follow `withApiHandler` + `requireAdminSession` pattern. Use `z` from `"zod/v4"`. Import `ApiError` for validation errors.

- [x] Task 7: Create Member Discipline History page + component
  - File: `src/app/[locale]/(admin)/admin/moderation/members/[userId]/page.tsx` (NEW)
  - Action: Server Component page:
    - Use `AdminPageHeader` with breadcrumbs: Dashboard → Moderation → Member History
    - Render `<MemberDisciplineHistory userId={userId} />`
    - Extract userId from params
  - File: `src/features/admin/components/MemberDisciplineHistory.tsx` (NEW)
  - Action: Client Component with:
    - `useQuery` to fetch `GET /api/v1/admin/discipline/[userId]`
    - **Active Suspension Banner** (if exists): amber/orange background, shows end date, time remaining, reason, issued by, "Lift Suspension Early" button
    - **Member Info Header**: name, account status badge (color-coded: green=APPROVED, orange=SUSPENDED, red=BANNED)
    - **Discipline Timeline**: All actions, most recent first. Each card:
      - Color-coded left border: yellow=warning, orange=suspension, red=ban
      - Action type badge, date, status badge (active/expired/lifted)
      - Reason text
      - If suspension: duration and end date
      - Issued by name
      - If lifted: lifted by + lifted at + lifted reason (from audit log details, if available)
    - "Back to Moderation Queue" link at top
  - File: `src/features/admin/components/LiftSuspensionDialog.tsx` (NEW)
  - Action: Modal dialog component:
    - Required reason textarea
    - Confirmation message: "This will restore the member's account to APPROVED status immediately."
    - Confirm + Cancel buttons
    - `useMutation` to POST to `/api/v1/admin/discipline/[userId]/lift`
    - On success: invalidate discipline query, show success toast/message
  - Notes: Follow `ModerationActionDialog.tsx` patterns for dialog styling (fixed overlay, bg-zinc-900, etc.). Use `useTranslations("Admin")` for all strings.

- [x] Task 8: Fix "View content" in ModerationQueue + add Author link
  - File: `src/features/admin/components/ModerationQueue.tsx`
  - Action — View Content fix (lines 233-247):
    - Replace the `<a href="/feed#post-...">` with a `<button>` that triggers content expansion
    - Add state: `expandedContentId: string | null` and `expandedContentBody: string | null`
    - On click: fetch `GET /api/v1/admin/moderation/[actionId]` (uses React Query `queryClient.fetchQuery` for caching). Extract `contentBody` from response. Set `expandedContentId = item.id` and `expandedContentBody = result.contentBody`.
    - Render: If `expandedContentId === item.id`, show a `<tr>` below the item row with the content body in a `<td colSpan={8}>` with `bg-zinc-800 p-4 text-sm text-zinc-300 whitespace-pre-wrap`. Add a "Hide content" button.
    - If `contentBody` is null, show "Content unavailable" in muted text.
  - Action — Author link with badge:
    - In the Author column `<td>` (line 250), replace plain text with:
      ```
      <a href={`/admin/moderation/members/${item.contentAuthorId}`} className="text-zinc-300 underline hover:text-white">
        {item.authorName ?? "Unknown"}
        {item.disciplineCount > 0 && (
          <span className="ml-1 text-xs bg-red-900 text-red-200 px-1 rounded">({item.disciplineCount})</span>
        )}
      </a>
      ```
    - Only render as link if `contentAuthorId` is a valid UUID (use `UUID_RE` test). Otherwise render as plain text.
  - Action — Link to full history from dialog:
    - In `ModerationActionDialog.tsx`, after the discipline history preview section (line 113), add a link:
      ```
      <a href={`/admin/moderation/members/${authorId}`} className="text-xs text-zinc-400 underline hover:text-white">
        View full history →
      </a>
      ```
    - This requires passing `contentAuthorId` as a new prop to `ModerationActionDialog`. Update the interface and the `openDisciplineDialog` function to pass it through.
  - Notes: The `ModerationQueueItem` interface already includes `disciplineCount` and `contentAuthorId`. The `UUID_RE` regex already exists in the `[actionId]/route.ts` — define it as a shared util or inline it.

- [x] Task 9: Write tests for all new code
  - File: `src/db/queries/member-discipline.test.ts` (existing or new, co-located)
  - Action: Add tests for any new query functions.
  - File: `src/db/queries/posts.test.ts`
  - Action: Add test for `getPostContentForModeration` — returns content even when post is soft-deleted.
  - File: `src/services/member-discipline-service.test.ts`
  - Action: Add tests for `liftSuspensionEarly`:
    - Happy path: suspension is active + user is SUSPENDED → status restored + discipline marked lifted + events emitted
    - 404: suspension not found
    - 409: suspension already lifted/expired
    - 409: user status is BANNED (cannot lift)
    - 409: user status is PENDING_DELETION (cannot lift)
    - Transaction atomicity: verify both updates happen inside transaction
    - **Transaction rollback test**: Mock the transaction so that the second update (discipline action) throws. Verify the first update (accountStatus → APPROVED) is rolled back and user remains SUSPENDED. This validates the atomic guarantee.
  - File: `src/app/api/v1/admin/discipline/[userId]/route.test.ts` (NEW)
  - Action: Test GET route: returns user info + discipline history + active suspension. 404 for unknown user. 403 for non-admin.
  - File: `src/app/api/v1/admin/discipline/[userId]/lift/route.test.ts` (NEW)
  - Action: Test POST route: validates body (reason required, suspensionId required). Calls service. 409 on already lifted. userId mismatch → 400. Non-admin → 403.
  - File: `src/app/api/v1/admin/moderation/[actionId]/route.test.ts` (existing)
  - Action: Add test for `contentBody` in GET response — for post, article, and message content types.
  - File: `src/features/admin/components/MemberDisciplineHistory.test.tsx` (NEW)
  - Action: Test renders: loading state, empty history, history timeline with all action types, active suspension banner, lift button opens dialog.
  - File: `src/features/admin/components/ModerationQueue.test.tsx` (existing or new)
  - Action: Test "View content" button expands/collapses content. Test Author column links to discipline history page. Test discipline badge shows count.
  - File: `src/services/notification-service.test.ts` (existing)
  - Action: Add test for `account.discipline_lifted` handler — verifies `deliverNotification` called with correct params. **Specifically verify `emailData.templateId === "discipline-suspension-lifted"`** (not just that deliverNotification was called — lesson from Epic 9 B3 bug where handlers were called without emailData).
  - File: `src/templates/email/discipline-suspension-lifted.test.ts` (NEW)
  - Action: Add render tests for the new email template:
    - Verify `render({ name: "Test", reason: "Early lift" }, "en")` returns non-empty `subject`, `html`, and `text`
    - Verify `render({ name: "Test", reason: "Early lift" }, "ig")` returns non-empty `subject`, `html`, and `text`
    - Verify the `reason` data field appears in both `html` and `text` output
    - Verify English subject contains "lifted" and Igbo subject contains "Emepela"
  - Notes: Follow co-located test pattern. Use `@vitest-environment node` for server files. Mock DB queries with `vi.mock`.

### Acceptance Criteria

- [x] AC 1: Given an admin on the moderation queue page, when they click an Author name, then they are navigated to `/admin/moderation/members/[userId]` showing the member's full discipline history.
- [x] AC 2: Given an admin on the discipline history page for a member with an active suspension, when they see the page, then an active suspension banner is displayed showing end date, time remaining, reason, and a "Lift Suspension Early" button.
- [x] AC 3: Given an admin clicks "Lift Suspension Early", when they enter a reason and confirm, then the suspension is lifted (status → lifted, user accountStatus → APPROVED), an audit log entry is created with action `LIFT_SUSPENSION_EARLY`, and the member receives an in-app notification and email informing them the suspension was lifted.
- [x] AC 4: Given an admin attempts to lift a suspension that is already lifted or expired, when they submit, then a 409 Conflict error is returned and the UI shows an appropriate message.
- [x] AC 5: Given an admin attempts to lift a suspension for a user whose status is BANNED, when they submit, then a 409 Conflict is returned (cannot overwrite BANNED status).
- [x] AC 6: Given a flagged item in the moderation queue with no content preview, when the admin clicks "View content", then the content is fetched from the detail endpoint and displayed inline in an expandable row below the item — NOT navigating to the public feed page.
- [x] AC 7: Given the "View content" expanded row is shown, when the admin clicks "Hide content", then the expanded row collapses.
- [x] AC 8: Given a flagged post that was soft-deleted by a previous moderation action, when an admin views its content via "View content", then the content is still displayed (not filtered out by deletedAt).
- [x] AC 9: Given an author in the moderation queue has prior discipline actions, when the admin views the queue, then the Author column shows the author's name with a badge count (e.g., "(2)") indicating prior discipline actions.
- [x] AC 10: Given the ModerationActionDialog showing discipline history preview, when the admin clicks "View full history", then they are navigated to the member's full discipline history page.
- [x] AC 11: Given a non-admin user attempts to access any admin discipline route, when the request is made, then a 403 Forbidden response is returned.

## Additional Context

### Dependencies

- No new npm packages required
- No new database migrations required
- Depends on existing: `@/lib/moderation-scanner` (`tiptapToPlainText`), `@/services/audit-logger`, `@/services/event-bus`, `@/db` (Drizzle), `@/lib/admin-auth`
- Email delivery depends on existing email job queue infrastructure

### Testing Strategy

- **Unit tests**: All new query functions, service function (`liftSuspensionEarly`), API routes (GET + POST), notification handler
- **Component tests**: `MemberDisciplineHistory` (renders timeline, banner, lift button), `ModerationQueue` (view content expand, author link + badge), `LiftSuspensionDialog` (form validation, mutation)
- **Integration**: Verify `liftSuspensionEarly` transaction atomicity — both positive (both updates happen) and negative (rollback on mid-transaction failure)
- **Email template tests**: Render tests for `discipline-suspension-lifted.ts` in both locales, verify data fields appear in output
- **Manual testing**:
  1. Suspend a test user → verify suspension appears in moderation queue
  2. Click Author name → verify discipline history page loads with active suspension banner
  3. Click "Lift Suspension Early" → enter reason → confirm → verify user can log in again
  4. Verify email received by test user
  5. In moderation queue, click "View content" on a flagged post with no preview → verify content appears inline
  6. Verify "View content" works for soft-deleted posts

### Notes

- **Race condition safety**: If the auto-lift job runs at the same moment an admin clicks "Lift Early", both will attempt to update the same records. This is safe because: (a) the transaction ensures atomicity for each operation, (b) `expireDisciplineAction` is an unconditional UPDATE (no WHERE status=active), and (c) the admin's POST route checks suspension status BEFORE the transaction — worst case, admin gets a 409 if the job beat them to it.
- **Event type gap**: `account.discipline_lifted` is a new event not yet in the typed `EventMap` (`src/types/events.ts`). For consistency, it should be added, but `account.discipline_issued` also isn't typed there. Both use inline types in notification-service. Follow existing pattern for now; typing cleanup is a separate concern.
- **Future consideration**: The discipline history page could be extended to support issuing discipline actions directly (warn/suspend/ban from the page without going through the moderation queue). Out of scope for this spec.
- **`tiptapToPlainText` import**: Verify this function is exported from `src/lib/moderation-scanner.ts`. If not, extract it as a standalone export.

## Review Notes

- Adversarial review completed
- Findings: 13 total, 2 fixed, 11 skipped (pre-existing/noise/low-priority)
- Resolution approach: auto-fix
- F2 (TOCTOU race): Moved all validation checks inside `db.transaction()` in `liftSuspensionEarly` to prevent race conditions
- F4 (dynamic imports): Replaced repeated `await import("@/lib/api-error")` with static import at module top
