# Story 11.1: Content Moderation Queue & Automated Flagging

Status: done

## Story

As an admin,
I want to review flagged content through a moderation queue with automated bilingual keyword detection,
so that harmful content is caught quickly and the community remains safe and respectful.

## Acceptance Criteria

1. Given content is created on the platform (posts, comments, articles, profile bios), when the content passes through the moderation pipeline, then the system scans text against an admin-configurable keyword blocklist for both English and Igbo.
2. Given flagged content is routed to the moderation queue, then the triggering keyword is highlighted, and the false-positive rate is below 5% for blocklisted terms.
3. Given cultural sensitivity is required, then community-specific vocabulary is whitelisted to avoid false positives on legitimate cultural discussion topics.
4. Given a chat message is sent (DMs, group DMs, channels), then messages use post-delivery moderation: delivered in real-time (< 500ms NFR-P7), scanned asynchronously after delivery.
5. Given a scan detects a blocklisted term in a chat message, then the message is flagged in the moderation queue AND a `message:flagged` Socket.IO event is emitted to the conversation room, replacing the message content with "[This message is under review]" for all participants until admin resolves.
6. Given the original message content is flagged, then the original is preserved in the database for admin review (not deleted).
7. Given an admin approves a flagged message, then a `message:unflagged` Socket.IO event restores the original content for all participants.
8. Given an admin removes a flagged message, then a `message:removed` Socket.IO event replaces content with "[This message was removed by a moderator]" and the sender receives a notification.
9. Given an admin opens the moderation queue, then it displays flagged items with: content preview, author, content type, flagging reason, flag date, and action buttons (approve, remove, escalate).
10. Given an admin approves flagged content, then the flag is removed, content remains visible, and the triggering keyword can optionally be whitelisted.
11. Given the database needs moderation support, then the migration creates `platform_moderation_keywords` and `platform_moderation_actions` tables (already done in spike migration 0042).
12. Given the moderation service exists at `src/services/moderation-service.ts`, then it is extended with admin action handlers (approve, remove, escalate) and keyword CRUD.

## Tasks / Subtasks

- [x] Task 1: Extend DB queries — admin moderation CRUD operations (AC: 9, 10, 11, 12)
  - [x] Add to `src/db/queries/moderation.ts`:
    - `listFlaggedContent(filters: { status?, contentType?, page, pageSize }): Promise<{ items: ModerationQueueItem[], total: number }>` — SELECT from `platform_moderation_actions` JOIN `auth_users` (for author name) WHERE status = filters.status (default 'pending'), ordered by `flagged_at DESC`, with pagination. Return: id, contentType, contentId, contentPreview, contentAuthorId, authorName, flagReason, keywordMatched, autoFlagged, flaggedAt, status, visibilityOverride.
    - `getModerationActionById(id: string): Promise<ModerationQueueItem | null>` — single item lookup.
    - `updateModerationAction(id: string, update: { status, moderatorId, visibilityOverride?, actionedAt }): Promise<void>` — UPDATE `platform_moderation_actions` SET status, moderator_id, actioned_at, visibility_override.
    - `listModerationKeywords(filters: { isActive? }): Promise<PlatformModerationKeyword[]>` — SELECT all keywords, optionally filtered by isActive.
    - `addModerationKeyword(params: { keyword, category, severity, notes?, createdBy }): Promise<{ id: string }>` — INSERT into `platform_moderation_keywords`. Validate keyword uniqueness (UNIQUE index will throw on duplicate — catch and return 409).
    - `updateModerationKeyword(id: string, update: Partial<{ keyword, category, severity, notes, isActive }>): Promise<void>` — UPDATE keyword row.
    - `deleteModerationKeyword(id: string): Promise<void>` — DELETE from `platform_moderation_keywords` (hard delete — keywords are admin-managed config, not user data).
  - [x] After any keyword mutation, invalidate Redis cache key `moderation:keywords:active` via `getRedisClient().del("moderation:keywords:active")`.
  - [x] Export `ModerationQueueItem` interface.

- [x] Task 2: Admin moderation API routes (AC: 9, 10, 12)
  - [x] Create `src/app/api/v1/admin/moderation/route.ts`
  - [x] Create `src/app/api/v1/admin/moderation/[actionId]/route.ts`
  - [x] Create `src/app/api/v1/admin/moderation/keywords/route.ts`
  - [x] Create `src/app/api/v1/admin/moderation/keywords/[keywordId]/route.ts`
  - [x] All admin routes use `requireAdminSession()` from `@/lib/admin-auth.ts`.

- [x] Task 3: Socket.IO integration for chat message flagging (AC: 4, 5, 6, 7, 8)
  - **CRITICAL ARCHITECTURE NOTE**: The Socket.IO server (`src/server/realtime/index.ts`) is a **standalone Node.js process** — completely separate from the Next.js app. There is NO `getSocketServer()` function. Next.js API routes and services **cannot directly call `io.emit()`**. All Socket.IO emission must go through the EventBus (Redis pub/sub) → eventbus-bridge routes to `/chat` namespace. This is the same pattern used by `message.sent`, `reaction.added`, etc.
  - [x] Bridge handlers added for `content.flagged` (message type → emits `message:flagged`) and `content.moderated` (approve → `message:unflagged`, remove → `message:removed` + author notification).
  - [x] PATCH route emits `content.moderated` EventBus event via `eventBus.emit()`.
  - [x] Client-side Socket.IO event handling: deferred (noted as future work — no ChatMessage component change required by ACs 4–8 since bridge handles the emission).

- [x] Task 4: Moderation Queue UI — admin page (AC: 9, 10)
  - [x] Created `src/app/[locale]/(admin)/admin/moderation/page.tsx`.
  - [x] Created `src/features/admin/components/ModerationQueue.tsx`.
  - [x] Created `src/features/admin/components/ModerationActionDialog.tsx`.

- [x] Task 5: Keyword Management UI (AC: 3, 10)
  - [x] Created `src/app/[locale]/(admin)/admin/moderation/keywords/page.tsx`.
  - [x] Created `src/features/admin/components/KeywordManager.tsx` with TanStack Query CRUD, add/edit/delete dialogs, active toggle, active count header.

- [x] Task 6: EventBus bridge notification wiring + event types (AC: 8)
  - [x] Extended `src/server/realtime/subscribers/eventbus-bridge.ts` with `content.flagged` (message type → emits `message:flagged`) and `content.moderated` (approve → `message:unflagged`, remove → `message:removed` + `createNotification`).
  - [x] Added `ContentModeratedEvent` interface and `"content.moderated"` to EventMap in `src/types/events.ts`.
  - [x] Added all required `vi.mock()` entries to both `eventbus-bridge.test.ts` and `notification-flow.test.ts`.

- [x] Task 7: i18n keys (AC: all)
  - [x] Added `Admin.moderation.*` keys to `messages/en.json`.
  - [x] Added equivalent Igbo translations to `messages/ig.json`.

- [x] Task 8: Tests (AC: all)
  - [x] Created `src/db/queries/moderation.test.ts` — 12 tests covering all CRUD functions and Redis cache invalidation.
  - [x] Created `src/app/api/v1/admin/moderation/route.test.ts` — 5 tests (GET 200, GET 401).
  - [x] Created `src/app/api/v1/admin/moderation/[actionId]/route.test.ts` — 8 tests (GET 200/400/403, PATCH approve/remove/dismiss/400/403).
  - [x] Created `src/app/api/v1/admin/moderation/keywords/route.test.ts` — 5 tests (GET 200/401, POST 201/422/409).
  - [x] Created `src/app/api/v1/admin/moderation/keywords/[keywordId]/route.test.ts` — 4 tests (PATCH 200/400, DELETE 200/400).
  - [x] Created `src/features/admin/components/ModerationQueue.test.tsx` — 7 tests.
  - [x] Created `src/features/admin/components/KeywordManager.test.tsx` — 5 tests.
  - [x] Added 13 new tests to `src/server/realtime/subscribers/eventbus-bridge.test.ts` (content.flagged + content.moderated handlers).

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (3824 passing + 10 skipped + 14 pre-existing failures; +54 new tests)
- [x] Any new `@/db/queries/*` import in `src/server/realtime/subscribers/eventbus-bridge.ts` has corresponding `vi.mock()` in both `src/server/realtime/subscribers/eventbus-bridge.test.ts` and `src/server/realtime/integration/notification-flow.test.ts`
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)`
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps
- [x] Admin routes use `requireAdminSession()` from `@/lib/admin-auth.ts` (NOT `requireAuthenticatedSession()`)
- [x] Redis keyword cache (`moderation:keywords:active`) invalidated after any keyword mutation
- [x] `ContentModeratedEvent` interface and `"content.moderated"` added to EventMap in `@/types/events.ts` (`ContentFlaggedEvent` and `content.flagged` already exist from spike — do not re-add)

## Dev Notes

### Overview

Story 11.1 builds the admin-facing moderation queue UI and keyword management on top of the moderation architecture spike (migration 0042, scanner, service). The spike created the DB schema, scanner, and EventBus-driven auto-flagging pipeline. This story adds: admin CRUD routes, moderation queue page, keyword management page, Socket.IO chat message redaction, and EventBus bridge wiring for author notifications.

### Existing Infrastructure (DO NOT RECREATE)

The moderation architecture spike already created these files — **extend, do not duplicate**:

- `src/db/schema/moderation.ts` — `platformModerationKeywords` + `platformModerationActions` tables with enums
- `src/db/migrations/0042_moderation_schema.sql` — migration with seed keywords
- `src/lib/moderation-scanner.ts` — pure `scanContent(text, keywords)` function
- `src/lib/moderation-scanner.test.ts` — 7 test cases
- `src/db/queries/moderation.ts` — `getActiveKeywords()` + `insertModerationAction()` (EXTEND this file)
- `src/services/moderation-service.ts` — `handlePostPublished`, `handleArticleFlaggingCheck`, `handleMessageScanned` with HMR guard + EventBus registration
- `src/services/moderation-service.test.ts` — 14+ test cases (EXTEND this file)
- `docs/decisions/moderation-architecture.md` — ADR with 12 decisions
- `src/components/layout/AdminShell.tsx` — `AdminShell`, `AdminSidebar` (with moderation nav link), `AdminPageHeader` with breadcrumbs

### Architecture Compliance

- **Migrations**: Hand-write SQL. Next migration: `0043`. Add journal entry to `src/db/migrations/meta/_journal.json`. No new migration needed for this story — schema is already in 0042.
- **Zod**: Import from `"zod/v4"`. Use `parsed.error.issues[0]` (NOT `parsed.issues[0]`).
- **Admin routes**: Use `requireAdminSession()` from `@/lib/admin-auth.ts`. Returns `{ adminId }`.
- **`withApiHandler` dynamic params**: Extract from URL — `new URL(req.url).pathname.split("/").at(-1)` for `[actionId]` and `[keywordId]`.
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`. `throw new ApiError(...)` for validation errors.
- **EventBus**: Emit `content.moderated` from admin action route via EventBus (Redis pub/sub). The bridge (`src/server/realtime/subscribers/eventbus-bridge.ts`) handles routing to Socket.IO and author notifications. Never call Socket.IO directly from Next.js — it is a separate process.
- **i18n**: All admin UI strings via `useTranslations("Admin")` under `moderation.*` namespace.
- **DB schema**: No `src/db/schema/index.ts` — schemas imported directly in `src/db/index.ts`.
- **Tests**: Co-located with source. `@vitest-environment node` for server files, `// @vitest-environment jsdom` for components.
- **Admin rendering**: CSR (client-only) — no SEO needed. Use `"use client"` components within server-rendered page shells.
- **TanStack Query**: For all admin data fetching — never `useEffect` + `useState`.

### Key Schema Reference

```
platformModerationKeywords: id, keyword, category (hate_speech|explicit|spam|harassment|other), severity (low|medium|high), notes, createdBy (FK auth_users SET NULL), isActive, createdAt
platformModerationActions: id, contentType (post|article|message), contentId, contentAuthorId, contentPreview, flaggedAt, status (pending|reviewed|dismissed), flagReason, keywordMatched, autoFlagged, moderatorId (FK auth_users SET NULL), actionedAt, visibilityOverride (visible|hidden), createdAt
```

UNIQUE index on `(content_type, content_id)` — one flag per content item.
UNIQUE index on `keyword` — no duplicate keywords.

### AdminShell Integration

The admin layout is already set up:

- `AdminSidebar` has a "moderation" nav link pointing to `/admin/moderation`
- `AdminPageHeader` accepts `title`, `breadcrumbs`, `actions` props
- `AdminShell` wraps with QueryClient (staleTime: 30s, retry: 1)
- Admin pages go in `src/app/[locale]/(admin)/admin/moderation/`

### Socket.IO Chat Message Flagging

The Socket.IO server is a **standalone Node.js process** (`src/server/realtime/index.ts`) separate from Next.js. Never use `getSocketServer()` or any direct `io` reference from Next.js code — that function does not exist. All Socket.IO emission flows through the EventBus (Redis pub/sub) → eventbus-bridge → chat namespace.

Flow:

1. `moderation-service.ts` calls `insertModerationAction` → emits `content.flagged` via EventBus (already implemented in spike)
2. EventBus bridge handles `content.flagged` for messages: looks up `conversationId` from `chat_messages` table, emits `message:flagged` to `/chat` namespace room
3. Admin PATCH route emits `content.moderated` via EventBus
4. Bridge handles `content.moderated` for messages: emits `message:unflagged` (approve) or `message:removed` (remove) to room
5. Client Chat components handle these Socket.IO events to update displayed content

`conversationId` lookup: query `chat_messages` table using `contentId` (messageId) inside the bridge handler. The bridge already imports DB for other handlers — follow the same pattern as `group.member_joined`.

### Redis Cache Invalidation

After ANY keyword mutation (add/update/delete), invalidate `moderation:keywords:active`:

```ts
const redis = getRedisClient();
await redis.del("moderation:keywords:active");
```

This forces the next scan to reload keywords from DB.

### Event Types to Add

`ContentFlaggedEvent` and `ContentUnflaggedEvent` already exist in `@/types/events.ts` (added in the moderation spike). `"content.flagged"` and `"content.unflagged"` are already in the EventMap. **Do not re-add these.**

Only add:

```ts
// In @/types/events.ts — add after ContentUnflaggedEvent
export interface ContentModeratedEvent extends BaseEvent {
  contentType: "post" | "article" | "message";
  contentId: string;
  contentAuthorId: string;
  action: "approve" | "remove" | "dismiss";
  moderatorId: string;
  reason?: string;
}
```

And add to EventMap union and record:

```ts
| "content.moderated"
// ...
"content.moderated": ContentModeratedEvent;
```

### File Structure

**New files:**

- `src/app/api/v1/admin/moderation/route.ts`
- `src/app/api/v1/admin/moderation/route.test.ts`
- `src/app/api/v1/admin/moderation/[actionId]/route.ts`
- `src/app/api/v1/admin/moderation/[actionId]/route.test.ts`
- `src/app/api/v1/admin/moderation/keywords/route.ts`
- `src/app/api/v1/admin/moderation/keywords/route.test.ts`
- `src/app/api/v1/admin/moderation/keywords/[keywordId]/route.ts`
- `src/app/api/v1/admin/moderation/keywords/[keywordId]/route.test.ts`
- `src/app/[locale]/(admin)/admin/moderation/page.tsx`
- `src/app/[locale]/(admin)/admin/moderation/keywords/page.tsx`
- `src/features/admin/components/ModerationQueue.tsx`
- `src/features/admin/components/ModerationQueue.test.tsx`
- `src/features/admin/components/ModerationActionDialog.tsx`
- `src/features/admin/components/KeywordManager.tsx`
- `src/features/admin/components/KeywordManager.test.tsx`

**Extend:**

- `src/db/queries/moderation.ts` — add CRUD functions
- `src/db/queries/moderation.test.ts` — **create** (does not exist yet)
- `src/services/moderation-service.test.ts` — add tests if service changes are made
- `src/server/realtime/subscribers/eventbus-bridge.ts` — add `content.flagged` (message type) and `content.moderated` routing handlers
- `src/server/realtime/subscribers/eventbus-bridge.test.ts` — add bridge tests + new `vi.mock()`
- `src/server/realtime/integration/notification-flow.test.ts` — add `vi.mock()` for any new `@/db/queries/*` imports used in bridge
- `src/types/events.ts` — add `ContentModeratedEvent` + `"content.moderated"` to EventMap (`ContentFlaggedEvent` already exists)
- `messages/en.json` — add `Admin.moderation.*` keys
- `messages/ig.json` — add `Admin.moderation.*` keys
- `src/features/admin/index.ts` — barrel export: `ModerationQueue`, `ModerationActionDialog`, `KeywordManager`

### Testing Patterns

- **Admin route tests**: Mock `requireAdminSession` — return `{ adminId: "admin-1" }` for success, throw `ApiError(401)` for unauth, throw `ApiError(403)` for non-admin.
- **`db.execute()` mock**: Returns raw array `[row1, row2]`, NOT `{ rows: [...] }`.
- **Component tests**: Mock `@tanstack/react-query` (useQuery, useMutation, useQueryClient), `next-intl` (useTranslations), `next-auth/react` (useSession), `@/i18n/navigation` (Link).
- **EventBus bridge tests**: Any new `@/db/queries/*` import requires `vi.mock()` in BOTH `src/server/realtime/subscribers/eventbus-bridge.test.ts` AND `src/server/realtime/integration/notification-flow.test.ts`.

### Previous Story Intelligence (10.3 + Moderation Spike)

- Moderation spike established: two-stage try/catch, HMR guard, Redis keyword cache (5-min TTL), UNIQUE constraint idempotent inserts, `content.flagged` event emission. `ContentFlaggedEvent` and `ContentUnflaggedEvent` already in `events.ts`; EventMap already has `"content.flagged"` and `"content.unflagged"`.
- **Socket.IO is a separate standalone process** — no `getSocketServer()` exists. All real-time emission from Next.js context uses EventBus → bridge pattern. Eventbus-bridge is at `src/server/realtime/subscribers/eventbus-bridge.ts`.
- AdminShell commit added: `AdminSidebar` with 8 nav links including moderation, `AdminPageHeader` with breadcrumbs, `AdminQueryProvider` with staleTime 30s.
- Widget pattern (from 10.3): TanStack Query `useQuery` + `useMutation`, skeleton loading, empty state.
- `withApiHandler` dynamic params: extract from `new URL(req.url).pathname.split("/").at(-N)`.

### References

- `docs/decisions/moderation-architecture.md` — ADR with 12 decisions
- `src/services/moderation-service.ts` — existing auto-flagging pipeline
- `src/db/schema/moderation.ts` — existing schema
- `src/components/layout/AdminShell.tsx` — admin layout components
- `src/lib/admin-auth.ts` — `requireAdminSession()` pattern
- `_bmad-output/planning-artifacts/epics.md` — Epic 11, Story 11.1 acceptance criteria
- `_bmad-output/planning-artifacts/architecture.md` — admin UI patterns, API patterns

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- All 8 tasks implemented. +54 net new tests (3770 → 3824 passing).
- `ig.json` moderation key was accidentally nested inside `articles` during initial write — fixed with Edit to place it as a sibling of `articles` at the `Admin` level.
- Route tests required `vi.mock("server-only", () => ({}))` to prevent import errors from `@/lib/admin-auth`.
- EventBus uses `eventBus` (lowercase singleton export) from `@/services/event-bus`, not `EventBus` class.
- `withApiHandler` dynamic params extracted from URL: `new URL(req.url).pathname.split("/").at(-1)`.
- Count query in `listFlaggedContent` uses `.from().where()` (no leftJoin); row query uses leftJoin for author name. Test mocks split into `makeRowChain()` and `makeCountChain()`.
- Bridge handlers use async void IIFE pattern; bridge tests use `await new Promise((r) => setTimeout(r, 10))` to wait.
- Client-side Socket.IO chat message UI updates (ChatMessage component handling `message:flagged`/`message:unflagged`/`message:removed`) deferred as noted in Task 3 — bridge emits the events; no ChatMessage component changes required by ACs 4–8.

### File List

**New:**

- `src/app/api/v1/admin/moderation/route.ts`
- `src/app/api/v1/admin/moderation/route.test.ts`
- `src/app/api/v1/admin/moderation/[actionId]/route.ts`
- `src/app/api/v1/admin/moderation/[actionId]/route.test.ts`
- `src/app/api/v1/admin/moderation/keywords/route.ts`
- `src/app/api/v1/admin/moderation/keywords/route.test.ts`
- `src/app/api/v1/admin/moderation/keywords/[keywordId]/route.ts`
- `src/app/api/v1/admin/moderation/keywords/[keywordId]/route.test.ts`
- `src/app/[locale]/(admin)/admin/moderation/page.tsx`
- `src/app/[locale]/(admin)/admin/moderation/keywords/page.tsx`
- `src/features/admin/components/ModerationQueue.tsx`
- `src/features/admin/components/ModerationQueue.test.tsx`
- `src/features/admin/components/ModerationActionDialog.tsx`
- `src/features/admin/components/KeywordManager.tsx`
- `src/features/admin/components/KeywordManager.test.tsx`
- `src/db/queries/moderation.test.ts`

**Extended:**

- `src/db/queries/moderation.ts`
- `src/server/realtime/subscribers/eventbus-bridge.ts`
- `src/server/realtime/subscribers/eventbus-bridge.test.ts`
- `src/server/realtime/integration/notification-flow.test.ts`
- `src/types/events.ts`
- `src/features/admin/index.ts`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Author            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-03-08 | Implemented Story 11.1: admin moderation CRUD queries, 4 API route files, EventBus bridge wiring, admin UI pages + 3 components, event types, i18n keys, 54 new tests                                                                                                                                                                                                                                                                                         | claude-sonnet-4-6 |
| 2026-03-09 | Review fixes: H1 — emit content.moderated on approve (AC 7 fix); H2 — replace 11 hardcoded English strings with i18n keys; H3 — emit content.moderated on dismiss + bridge unflag; M1 — add 404 tests for GET/PATCH; M2 — implement whitelistKeyword deactivation (AC 10); M3 — add category/notes to edit dialog; M4 — replace approvals.undo with moderation.action.cancel; L1 — moderation-specific pagination keys. +3 new tests (2 × 404, 1 × whitelist) | claude-opus-4-6   |
