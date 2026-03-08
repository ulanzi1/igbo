---
title: "Moderation Architecture Spike"
slug: "moderation-architecture-spike"
created: "2026-03-08"
status: "completed"
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    "Next.js 16",
    "TypeScript strict",
    "Drizzle ORM",
    "PostgreSQL",
    "Redis",
    "EventBus (ioredis)",
    "Vitest",
  ]
files_to_modify:
  - src/types/events.ts
  - src/services/audit-logger.ts
  - src/server/jobs/index.ts
  - src/db/index.ts
  - src/db/queries/posts.ts
  - src/db/queries/articles.ts
  - src/db/migrations/meta/_journal.json
files_to_create:
  - src/db/schema/moderation.ts
  - src/db/queries/moderation.ts
  - src/lib/moderation-scanner.ts
  - src/lib/moderation-scanner.test.ts
  - src/services/moderation-service.ts
  - src/services/moderation-service.test.ts
  - src/db/migrations/0042_moderation_schema.sql
  - docs/decisions/moderation-architecture.md
code_patterns:
  - "EventBus HMR guard (points-engine.ts pattern)"
  - "Two-stage try/catch in async EventBus handlers"
  - "Redis keyword cache with TTL + invalidation"
  - "pgEnum for enum columns; uuid().primaryKey().defaultRandom() for PK"
  - "SQL migration: enum → table → index → seed (0035_points_engine.sql pattern)"
test_patterns:
  - "makeHandlerRegistry() from vi-patterns.ts for EventBus handler capture"
  - "@vitest-environment node for all service/query tests"
  - "Real scanContent in service tests (pure function — do NOT mock)"
  - "vi.mock for DB queries + Redis client in service tests"
---

# Tech-Spec: Moderation Architecture Spike

**Created:** 2026-03-08

## Overview

### Problem Statement

Epic 11 (Content Governance & Admin) requires a platform-wide content moderation system. No moderation infrastructure exists — no keyword scanning, no flag lifecycle, no admin moderation queue, no `ModerationService`. Without a settled architecture, each Epic 11 story would invent its own approach, producing an inconsistent, untestable, and fragile governance system. The team agreed in the Epic 10 retrospective that a spike producing this architecture spec must complete before Story 11.1 is authored.

### Solution

Design and document (with skeleton implementation) a `ModerationService` that:

- Listens on `post.published`, `article.published`, and `message.sent` EventBus events
- Scans content against a Redis-cached keyword list (5-min TTL) using a pure `scanContent()` function
- Writes idempotent flag records to `platform_moderation_actions` on match
- Emits `content.flagged` EventBus events (consumed by future bridge work for admin Socket.IO room)
- Never blocks content creation — all work is async, in background handlers with two-stage try/catch
- Establishes the DB schema, service boundary, failure handling contract, scan algorithm, and visibility rule that all Epic 11 stories must follow

### Scope

**In Scope:**

- DB schema: `platform_moderation_keywords` + `platform_moderation_actions` (migration 0042)
- `src/lib/moderation-scanner.ts`: pure `scanContent()` function + `Keyword` type
- `src/db/queries/moderation.ts`: `getActiveKeywords()` + `insertModerationAction()`
- `src/db/queries/posts.ts`: add lean `getPostContent()` query
- `src/services/moderation-service.ts`: EventBus registration (HMR guard), three handlers, Redis cache management
- `src/types/events.ts`: `ContentFlaggedEvent`, `ContentUnflaggedEvent` interfaces + EventName + EventMap entries
- `src/services/audit-logger.ts`: extend `AdminAction` union with 4 moderation actions
- `src/server/jobs/index.ts`: add side-effect bootstrap import
- `src/db/index.ts`: add schema import + spread
- Architecture decision doc: `docs/decisions/moderation-architecture.md`
- Seed data: ≤20 high-confidence keywords in migration 0042

**Out of Scope:**

- Admin UI routes, moderation queue page (Epic 11 stories)
- Group leader moderation visibility (Epic 11 backlog)
- Self-service appeal UI (post-Epic 11)
- `admins` Socket.IO room + bridge handler for `content.flagged` (Epic 11 Story 11.x)
- Daily reconciliation job for missed flags (Epic 11 backlog)
- Manual flag from admin routes (Epic 11)
- Health check route `GET /api/v1/admin/health/moderation` (Epic 11 backlog)

---

## Context for Development

### Scope of Protection (ADR-0 — read first)

Keyword scanning is a **tripwire, not a complete moderation solution.** It surfaces content for human review — the human moderator determines harm, not the system. This system flags content matching known keywords. It does NOT detect: harassment (relational, not keyword-based), misinformation, coordinated inauthentic behavior, or novel harmful content not yet in the keyword list. Complementary mechanisms (member reporting, manual admin review) are required for complete governance. Epic 11 story authors must not treat a reviewed flag queue as equivalent to "the platform is moderated."

### Visibility Rule (Option B — Why?)

The Obigbo community has a complex history with content suppression. False-positive auto-hiding of legitimate Igbo vocabulary would damage community trust catastrophically. Option B: **flagged content remains visible to all members; hidden only on explicit moderator escalation.** This means:

- Existing content query functions (`getPostById`, `getArticleBySlug`, `getMessage`) require NO changes
- `visibility_override = 'hidden'` is set only by an explicit admin route action
- Hide/unhide routes must notify the content author via `NotificationService` (type: `admin_announcement`)
- Dismissed false-positive flags do NOT notify the author

### Codebase Patterns

- **EventBus HMR guard**: `src/services/points-engine.ts` lines 187–250 — canonical pattern. `ModerationService` follows exactly: `globalThis.__moderationHandlersRegistered`, exported handler functions, per-event try/catch with structured JSON error log.
- **Bootstrap import location**: `src/server/jobs/index.ts` — confirmed. Already hosts `notification-service` and `points-engine` side-effect imports. Add `moderation-service` directly below `points-engine`. Note: file has open `TODO: Epic 9 — move to proper server init module` — add to same file anyway; all three move together when that TODO is addressed.
- **Event types**: `src/types/events.ts` — add `ContentFlaggedEvent`, `ContentUnflaggedEvent` interfaces + entries in `EventName` union + `EventMap`.
- **DB schema**: No `src/db/schema/index.ts` — import as `import * as moderationSchema from "./schema/moderation"` in `src/db/index.ts`, spread into drizzle schema object.
- **Migration pattern**: Hand-write SQL + add entry to `src/db/migrations/meta/_journal.json`. Next idx: **42**. Journal entry: `{ "idx": 42, "version": "7", "when": 1708000042000, "tag": "0042_moderation_schema", "breakpoints": true }`.
- **SQL pattern**: `CREATE TYPE` → `CREATE TABLE` → `CREATE INDEX` → `INSERT` (seed). See `0035_points_engine.sql`.
- **Schema pattern**: `pgEnum` at top of file, `uuid().primaryKey().defaultRandom()`, `timestamp({ withTimezone: true }).defaultNow().notNull()`. See `platform-points.ts`.
- **`getPostContent` gap**: `src/db/queries/posts.ts` has `getPostContentLength()` but no function returning post body text. Add `getPostContent(postId: string): Promise<string | null>` after line ~167.
- **`vi-patterns.ts`**: `makeHandlerRegistry()` is the canonical EventBus handler capture pattern for tests.

### Architecture Decision Records

#### ADR-1: Hook Location

EventBus listeners on `post.published`, `article.published`, `message.sent`. HMR guard. Exported handlers: `handlePostPublished`, `handleArticleFlaggingCheck`, `handleMessageScanned`. Post handler DB-reads content (async — HTTP response already returned).

#### ADR-2: Keyword Schema — `platform_moderation_keywords`

| Column       | Type                                                     | Notes                                                   |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------- |
| `id`         | `UUID PK DEFAULT gen_random_uuid()`                      |                                                         |
| `keyword`    | `TEXT NOT NULL`                                          |                                                         |
| `category`   | `enum(hate_speech\|explicit\|spam\|harassment\|other)`   |                                                         |
| `severity`   | `enum(low\|medium\|high)`                                | Independent of category (Igbo vocabulary context)       |
| `notes`      | `TEXT nullable`                                          | Cultural context, rationale for activation/deactivation |
| `created_by` | `UUID NOT NULL REFERENCES auth_users ON DELETE SET NULL` |                                                         |
| `is_active`  | `BOOLEAN NOT NULL DEFAULT true`                          | Soft-delete preserves history                           |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()`                     |                                                         |

Seed: ≤20 high-confidence keywords. Must be reviewed by native Igbo speaker before production migration runs.

#### ADR-3: Actions Schema — `platform_moderation_actions`

| Column                | Type                                                          | Notes                                                |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| `id`                  | `UUID PK DEFAULT gen_random_uuid()`                           |                                                      |
| `content_type`        | `enum(post\|article\|message) NOT NULL`                       |                                                      |
| `content_id`          | `TEXT NOT NULL`                                               | UUID as text                                         |
| `content_author_id`   | `TEXT NOT NULL`                                               | Denormalized — avoids JOIN in admin queue            |
| `content_preview`     | `TEXT nullable`                                               | First 200 chars stored at flag time                  |
| `flagged_at`          | `TIMESTAMPTZ NOT NULL DEFAULT now()`                          |                                                      |
| `status`              | `enum(pending\|reviewed\|dismissed) NOT NULL DEFAULT pending` |                                                      |
| `flag_reason`         | `TEXT NOT NULL`                                               | e.g. "Keyword match: [word] (category: hate_speech)" |
| `keyword_matched`     | `TEXT nullable`                                               | Exact keyword; null for manual flags                 |
| `auto_flagged`        | `BOOLEAN NOT NULL DEFAULT true`                               | false = manual admin flag (future)                   |
| `moderator_id`        | `UUID nullable REFERENCES auth_users ON DELETE SET NULL`      | Set on action                                        |
| `actioned_at`         | `TIMESTAMPTZ nullable`                                        |                                                      |
| `visibility_override` | `enum(visible\|hidden) NOT NULL DEFAULT visible`              | Option B enforcement                                 |
| `created_at`          | `TIMESTAMPTZ NOT NULL DEFAULT now()`                          |                                                      |

Indexes:

- `idx_moderation_actions_status_flagged_at ON (status, flagged_at DESC)` — admin queue pagination
- `UNIQUE idx_moderation_actions_content ON (content_type, content_id)` — one flag per content item; INSERT uses `ON CONFLICT DO NOTHING`

#### ADR-4: Failure Handling (two-stage try/catch)

```
Handler entry point (async, non-blocking):
  Stage 1: try { keywords = await getActiveKeywords() }
           catch { log JSON + return }           ← bail early, no partial state
  Scan:    match = scanContent(content, keywords) // synchronous
           if (!match) return
  Stage 2: try { action = await insertModerationAction({...}) }
           catch { log JSON
                   redis.incr("moderation:failed:total").catch(() => {})
                   redis.set("moderation:failed:last_error_at", ISO).catch(() => {})
                   return }
  Emit:    try { eventBus.emit("content.flagged", {...}) }
           catch { log JSON }                    ← emit failure never throws
```

Redis keyword cache: key `moderation:keywords:active`, TTL `EX 300` (5 min). DEL on any keyword create/update/deactivate. Log keyword count on first cache miss; WARN if count === 0.

#### ADR-5: Chat Integration — Feasibility Assessment

**Feasible, deferred to Epic 11 Story 11.x.** `message.sent` payload already contains `content: string` — no DB read needed for message scanning. `ModerationService` handler works today for flagging. Bridge integration requires:

- New `admins` Socket.IO room on the realtime server
- Auth check on socket join (verify admin role via DB or token)
- Bridge handler: `eventBus.on("content.flagged") → socket.to("admins").emit("content:flagged", payload)`
- Regular member sockets NEVER receive `content.flagged`
- No optimistic flag rendering in chat UI (flag badge renders only on socket event receipt)

#### ADR-6: ModerationService Boundary

**Owns:** keyword scan, flag record write, `content.flagged` emit, Redis cache management
**Does NOT own:** admin UI routes, notification delivery (NotificationService handles hide/unhide notifications), audit logging (admin routes call `logAdminAction()`)

`AdminAction` union extensions in `audit-logger.ts`:

```typescript
| "FLAG_CONTENT" | "UNFLAG_CONTENT" | "HIDE_CONTENT" | "UNHIDE_CONTENT"
```

#### ADR-6b: Scan Algorithm — `src/lib/moderation-scanner.ts`

```ts
export interface Keyword {
  keyword: string;
  category: string;
  severity: "low" | "medium" | "high";
}
export function scanContent(text: string, keywords: Keyword[]): Keyword | null;
```

Algorithm: (1) normalize text: `toLowerCase()` + NFD decompose + strip combining diacriticals; (2) sort keywords high→medium→low severity; (3) for each: normalize keyword same way, test `\b{normalized}\b` whole-word regex; (4) return first match or `null`. `Keyword` type is single source of truth — imported by `moderation.ts` queries and `moderation-service.ts`.

#### ADR-6c: `content.flagged` / `content.unflagged` Event Shapes

```ts
interface ContentFlaggedEvent extends BaseEvent {
  contentType: "post" | "article" | "message";
  contentId: string;
  contentAuthorId: string;
  contentPreview: string | null;
  flagReason: string;
  severity: "low" | "medium" | "high";
  moderationActionId: string;
}
interface ContentUnflaggedEvent extends BaseEvent {
  contentType: "post" | "article" | "message";
  contentId: string;
  moderationActionId: string;
  moderatorId: string;
}
```

#### ADR-6d: Query Function Signatures

```ts
// src/db/queries/moderation.ts
export async function getActiveKeywords(): Promise<Keyword[]>;
// SELECT keyword, category, severity FROM platform_moderation_keywords WHERE is_active = true

export async function insertModerationAction(params: {
  contentType: "post" | "article" | "message";
  contentId: string;
  contentAuthorId: string;
  contentPreview: string | null;
  flagReason: string;
  keywordMatched: string | null;
  autoFlagged?: boolean; // default true
}): Promise<{ id: string } | null>; // null = ON CONFLICT DO NOTHING (already flagged)

// src/db/queries/posts.ts (new, add after getPostContentLength ~line 167)
export async function getPostContent(postId: string): Promise<string | null>;
// SELECT content FROM community_posts WHERE id = postId AND deleted_at IS NULL
```

#### ADR-9: Idempotent Flag Insert

`UNIQUE(content_type, content_id)` constraint on `platform_moderation_actions`. INSERT uses `ON CONFLICT (content_type, content_id) DO NOTHING`. One flag per content item — period. Highest-severity keyword match stored. Protects against: multiple keyword matches, serverless cold-start double-registration, manual re-scan.

#### ADR-10: Redis Failure Instrumentation

On any catch in moderation handler: `INCR moderation:failed:total` (never expires) + `SET moderation:failed:last_error_at <ISO>` (non-expiring). Future health check response shape: `{ status, failedCount, lastErrorAt, keywordsLoaded }`.

#### ADR-11: Keyword Seed Discipline

≤20 keywords in seed. Native Igbo speaker review required before production migration.

#### ADR-12: HMR Guard Serverless Caveat

`globalThis.__moderationHandlersRegistered` prevents dev-mode double-registration only. Serverless cold starts each have clean `globalThis`. Mitigation: ADR-9 UNIQUE constraint prevents duplicate flag records regardless.

### Deferred Items (document for Epic 11 story authors)

1. **Group leader flag visibility** — derive `group_id` via JOIN on `community_posts`; story adds leader notification. Epic 11 backlog.
2. **Self-service appeal UI** — launch appeal path = email admin. No in-app UI for Epic 11.
3. **Dismissed flag notification** — dismissed flags do NOT notify author. Confirmed.
4. **Daily reconciliation job** — catch EventBus handler failures. Epic 11 backlog.
5. **`severity: low` auto-dismiss** — post-Epic 11.
6. **Keyword review cadence** — quarterly, designated cultural moderator. Team agreement.
7. **Health check route** `GET /api/v1/admin/health/moderation` — Epic 11 backlog.
8. **Bridge `admins` room** — Socket.IO admin room + auth on join. Epic 11 Story 11.x.

### Files to Reference

| File                                       | Purpose                                                |
| ------------------------------------------ | ------------------------------------------------------ |
| `src/services/points-engine.ts`            | Canonical HMR guard + handler pattern                  |
| `src/services/event-bus.ts`                | TypedEventBus singleton                                |
| `src/types/events.ts`                      | Extend with ContentFlaggedEvent, ContentUnflaggedEvent |
| `src/services/audit-logger.ts`             | Extend AdminAction union                               |
| `src/server/jobs/index.ts`                 | Bootstrap file — add side-effect import                |
| `src/db/migrations/meta/_journal.json`     | Add idx:42 entry                                       |
| `src/db/index.ts`                          | Add moderationSchema import + spread                   |
| `src/db/queries/posts.ts`                  | Add getPostContent() after line ~167                   |
| `src/db/schema/platform-points.ts`         | Schema pattern reference                               |
| `src/db/migrations/0035_points_engine.sql` | SQL migration pattern reference                        |
| `src/test/vi-patterns.ts`                  | makeHandlerRegistry() for tests                        |

---

## Implementation Plan

### Tasks

- [x] **Task 1: SQL migration + journal entry**
  - File: `src/db/migrations/0042_moderation_schema.sql` _(create)_
  - Action: Write SQL migration following `0035_points_engine.sql` pattern:
    1. `CREATE TYPE moderation_keyword_category AS ENUM ('hate_speech', 'explicit', 'spam', 'harassment', 'other')`
    2. `CREATE TYPE moderation_keyword_severity AS ENUM ('low', 'medium', 'high')`
    3. `CREATE TYPE moderation_content_type AS ENUM ('post', 'article', 'message')`
    4. `CREATE TYPE moderation_action_status AS ENUM ('pending', 'reviewed', 'dismissed')`
    5. `CREATE TYPE moderation_visibility_override AS ENUM ('visible', 'hidden')`
    6. `CREATE TABLE platform_moderation_keywords (...)` per ADR-2 schema
    7. `CREATE TABLE platform_moderation_actions (...)` per ADR-3 schema
    8. `CREATE INDEX idx_moderation_actions_status_flagged_at ON platform_moderation_actions(status, flagged_at DESC)`
    9. `CREATE UNIQUE INDEX idx_moderation_actions_content ON platform_moderation_actions(content_type, content_id)`
    10. `INSERT INTO platform_moderation_keywords ...` — ≤20 seed keywords (to be reviewed by Igbo speaker)
  - File: `src/db/migrations/meta/_journal.json` _(modify)_
  - Action: Append entry `{ "idx": 42, "version": "7", "when": 1708000042000, "tag": "0042_moderation_schema", "breakpoints": true }` to `entries` array

- [x] **Task 2: Drizzle schema**
  - File: `src/db/schema/moderation.ts` _(create)_
  - Action: Define Drizzle schema following `platform-points.ts` pattern:
    - Export `moderationKeywordCategoryEnum`, `moderationKeywordSeverityEnum`, `moderationContentTypeEnum`, `moderationActionStatusEnum`, `moderationVisibilityEnum` via `pgEnum`
    - Export `platformModerationKeywords` table (all columns per ADR-2)
    - Export `platformModerationActions` table (all columns per ADR-3; unique constraint on `(contentType, contentId)`)
    - Export `PlatformModerationKeyword`, `PlatformModerationAction` inferred types

- [x] **Task 3: Register schema in db/index.ts**
  - File: `src/db/index.ts` _(modify)_
  - Action: Add `import * as moderationSchema from "./schema/moderation"` after `dismissedRecsSchema` import; add `...moderationSchema` to the drizzle schema spread object

- [x] **Task 4: Pure scan function**
  - File: `src/lib/moderation-scanner.ts` _(create)_
  - Action: Export `Keyword` interface and `scanContent(text, keywords): Keyword | null` per ADR-6b algorithm. No imports from `@/db` or `@/services` — pure utility only.

- [x] **Task 5: Scanner unit tests**
  - File: `src/lib/moderation-scanner.test.ts` _(create)_
  - Action: No mocks. Test cases:
    - Returns `null` for empty keyword list
    - Returns `null` when no keyword matches
    - Matches exact keyword (case-sensitive input, case-insensitive match)
    - Matches keyword with Igbo diacritics stripped (NFD normalization)
    - Whole-word boundary: does NOT match keyword as substring (e.g. `"classic"` does not match keyword `"ass"`)
    - Returns highest-severity match when multiple keywords present
    - Returns `null` for empty text string

- [x] **Task 6: DB query functions**
  - File: `src/db/queries/moderation.ts` _(create)_
  - Action: Implement per ADR-6d:
    - `getActiveKeywords()`: SELECT `keyword`, `category`, `severity` WHERE `is_active = true`; return `Keyword[]` (import `Keyword` from `@/lib/moderation-scanner`)
    - `insertModerationAction(params)`: INSERT with `ON CONFLICT (content_type, content_id) DO NOTHING`; return `{ id }` of inserted row or `null` on conflict
  - File: `src/db/queries/posts.ts` _(modify)_
  - Action: Add `getPostContent(postId: string): Promise<string | null>` after `getPostContentLength` (~line 167). Single-column SELECT `content` WHERE `id = postId AND deleted_at IS NULL`.

- [x] **Task 7: Extend event types**
  - File: `src/types/events.ts` _(modify)_
  - Action:
    - Add `ContentFlaggedEvent` interface per ADR-6c after article events section
    - Add `ContentUnflaggedEvent` interface per ADR-6c
    - Add `"content.flagged"` and `"content.unflagged"` to `EventName` union
    - Add both to `EventMap`

- [x] **Task 8: Extend AdminAction union**
  - File: `src/services/audit-logger.ts` _(modify)_
  - Action: Add `| "FLAG_CONTENT" | "UNFLAG_CONTENT" | "HIDE_CONTENT" | "UNHIDE_CONTENT"` to `AdminAction` type union

- [x] **Task 9: ModerationService**
  - File: `src/services/moderation-service.ts` _(create)_
  - Action: Implement following `points-engine.ts` pattern exactly:
    - `import "server-only"`
    - Import `eventBus`, `getActiveKeywords`, `insertModerationAction`, `getPostContent`, `getArticleContent`, `scanContent`, `getRedisClient`
    - Export `handlePostPublished(payload: PostPublishedEvent): Promise<void>` — fetches post content via `getPostContent`, runs two-stage try/catch per ADR-4
    - Export `handleArticleFlaggingCheck(payload: ArticlePublishedEvent): Promise<void>` — fetches article body via `getArticleContent(payload.articleId)`, concatenates with `payload.title` for scan text, runs two-stage try/catch per ADR-4
    - Export `handleMessageScanned(payload: MessageSentEvent): Promise<void>` — uses `payload.content` directly (no DB read needed)
    - All handlers: Redis keyword cache (`moderation:keywords:active`, EX 300, DEL on invalidation), two-stage try/catch per ADR-4, structured JSON error logs
    - HMR guard block at bottom: `globalThis.__moderationHandlersRegistered` — registers `eventBus.on()` for all three events with try/catch wrappers

- [ ] **Task 9b: Article content query**
  - File: `src/db/queries/articles.ts` _(modify)_
  - Action: Add `getArticleContent(articleId: string): Promise<string | null>` — lean single-column SELECT on `community_articles.content` WHERE `id = articleId AND deleted_at IS NULL` (or equivalent soft-delete column). Pattern mirrors `getPostContent` exactly. Import in `moderation-service.ts`.

- [x] **Task 10: Bootstrap import**
  - File: `src/server/jobs/index.ts` _(modify)_
  - Action: Add directly after the `points-engine` import:
    ```ts
    // Side-effect import: registers all eventBus.on() handlers for content moderation
    // (post.published, article.published, message.sent)
    import "@/services/moderation-service";
    ```

- [x] **Task 11: ModerationService tests**
  - File: `src/services/moderation-service.test.ts` _(create)_
  - Action: `@vitest-environment node`. Use `makeHandlerRegistry()` from `src/test/vi-patterns.ts`. Mock: `@/services/event-bus`, `@/db/queries/moderation` (`getActiveKeywords`, `insertModerationAction`), `@/db/queries/posts` (`getPostContent`), `@/db/queries/articles` (`getArticleContent`), `@/lib/redis`. Use **real** `scanContent` (do NOT mock). Minimum 10 test cases:
    1. HMR guard: `eventBus.listenerCount` === 1 for each of `post.published`, `article.published`, `message.sent` after module import
    2. `handlePostPublished`: post not found (`getPostContent` returns null) → `insertModerationAction` never called
    3. `handlePostPublished`: post found, no keyword match → `insertModerationAction` never called
    4. `handlePostPublished`: post found, keyword match → `insertModerationAction` called with correct params + `content.flagged` emitted with correct payload
    5. `handlePostPublished`: `getActiveKeywords()` throws → no insert, no throw propagation, structured error logged
    6. `handlePostPublished`: `insertModerationAction()` returns null (conflict) → `content.flagged` NOT emitted
    7. `handlePostPublished`: `insertModerationAction()` throws → `moderation:failed:total` incremented, `moderation:failed:last_error_at` set, no throw propagated
    8. `handleArticleFlaggingCheck`: article content match → flag written with `content_type = 'article'`
    9. `handleMessageScanned`: message content match, `getPostContent` never called → flag written with `content_type = 'message'`
    10. `handleMessageScanned`: no keyword match → `insertModerationAction` never called

- [x] **Task 12: Event type tests**
  - File: `src/types/events.test.ts` _(modify)_
  - Action: Add type assignment tests for `ContentFlaggedEvent` and `ContentUnflaggedEvent` following existing pattern in that file

- [x] **Task 13: Architecture decision document**
  - File: `docs/decisions/moderation-architecture.md` _(create)_
  - Action: Write team-facing ADR document. Must open with:
    1. **"Why Option B?"** — cultural context, Igbo vocabulary false-positive risk, visible-but-flagged rationale
    2. **"Scope of Protection"** — what the system catches and what it explicitly does not
    3. All ADRs 1–12 in readable prose (not spec format)
    4. Chat integration feasibility assessment (ADR-5)
    5. Deferred items list with owners
    6. Team agreements from Epic 10 retro (every admin action calls `logAdminAction()`, moderation logic in `ModerationService` only, no per-story event payload invention)

### Acceptance Criteria

- [x] **AC1:** Given migration 0042 runs, when `SELECT * FROM platform_moderation_keywords` is executed, then the table exists with all columns per ADR-2 schema and ≤20 seed rows are present with `is_active = true`.

- [x] **AC2:** Given migration 0042 runs, when two rows are inserted into `platform_moderation_actions` with the same `(content_type, content_id)`, then the second INSERT is silently ignored (ON CONFLICT DO NOTHING) and only one row exists.

- [x] **AC3:** Given `scanContent("I love classic music", [{keyword: "ass", severity: "high"}])` is called, then the result is `null` (whole-word boundary prevents partial match).

- [x] **AC4:** Given `scanContent("Ụnọ", [{keyword: "uno", severity: "medium"}])` is called, then the result matches (diacritic normalization — NFD strips tone marks).

- [x] **AC5:** Given `scanContent("text with BADWORD here", [{keyword: "badword", severity: "high"}, {keyword: "text", severity: "low"}])` is called, then the result is the `high` severity keyword (highest severity returned first).

- [x] **AC6:** Given a `post.published` event fires for a post whose content contains an active keyword, when `handlePostPublished` completes, then one row exists in `platform_moderation_actions` with correct `content_type = 'post'`, `content_id`, `content_author_id`, `flag_reason` containing the keyword and category, `keyword_matched`, `auto_flagged = true`, `status = 'pending'`, `visibility_override = 'visible'`.

- [x] **AC7:** Given a `post.published` event fires for a post with no keyword match, when `handlePostPublished` completes, then no row is inserted into `platform_moderation_actions`.

- [x] **AC8:** Given a `post.published` event fires and `getActiveKeywords()` throws, when the handler catches the error, then no row is inserted, the structured error is logged, and the HTTP response that triggered the event is NOT affected (handler is async/background).

- [x] **AC9:** Given a `post.published` event fires and `insertModerationAction()` throws, when the handler catches the error, then `moderation:failed:total` is incremented and `moderation:failed:last_error_at` is set in Redis (fire-and-forget), and no exception propagates out of the handler.

- [x] **AC10:** Given a `message.sent` event fires with content containing an active keyword, when `handleMessageScanned` completes, then one flag record is written with `content_type = 'message'` and no DB read for content was made (payload `content` field used directly).

- [x] **AC11:** Given `post.published` fires twice for the same post (e.g. serverless cold-start double-registration), when both handlers run, then exactly one flag record exists in `platform_moderation_actions` (UNIQUE constraint + ON CONFLICT DO NOTHING).

- [x] **AC12:** Given `moderation-service.ts` is imported, when `eventBus.listenerCount("post.published")` is checked, then the count is exactly 1 (HMR guard prevents double-registration in dev mode).

- [x] **AC13:** Given `ContentFlaggedEvent` and `ContentUnflaggedEvent` are defined in `events.ts`, when TypeScript compiles, then `tsc --noEmit` produces zero errors.

- [x] **AC14:** Given the `AdminAction` union in `audit-logger.ts` is extended, when an Epic 11 route calls `logAdminAction({ action: "FLAG_CONTENT", ... })`, then TypeScript accepts it without error.

- [x] **AC15:** Given `docs/decisions/moderation-architecture.md` exists, when read, then the document opens with a "Why Option B?" section followed by a "Scope of Protection" section, and all 12 ADRs are documented.

---

## Additional Context

### Dependencies

- **Migration 0042** must run before `ModerationService` handlers are active in production. Handlers register on bootstrap regardless — but `insertModerationAction` will fail if tables don't exist.
- **`src/db/index.ts`** must import `moderationSchema` before any query functions reference the schema tables.
- **`getArticleContent` query** (Task 9 Note): if article body scanning is implemented, a new lean query must be added to `src/db/queries/articles.ts` mirroring `getPostContent`.
- **`content.flagged` event shape** (ADR-6c) is authoritative for Epic 11 bridge story — no per-story payload invention permitted (Epic 10 retro team agreement).

### Testing Strategy

**`src/lib/moderation-scanner.test.ts`** — pure unit tests, zero mocks. 7 cases covering: empty list, no match, exact match, diacritic normalization, whole-word boundary, highest-severity selection, empty text.

**`src/services/moderation-service.test.ts`** — `@vitest-environment node`. Mocks: `@/services/event-bus` (via `makeHandlerRegistry()`), `@/db/queries/moderation`, `@/db/queries/posts`, `@/db/queries/articles`, `@/lib/redis`. Real `scanContent` (do NOT mock — pure function catches real integration). 10+ cases covering all three handlers, conflict path, failure counter, HMR guard.

**`src/types/events.test.ts`** — type assignment tests for 2 new event interfaces.

**Pre-existing test baseline:** 3,741 passing + 10 skipped + 12 pre-existing failures (2 lua-runner + 10 BottomNav). Must not regress.

### Notes

- **Pre-ship checklist:** Seed keyword list in migration 0042 requires native Igbo speaker review before production migration runs. Schedule this review before Epic 11 Story 11.1 ships.
- **`jobs/index.ts` open TODO:** File has `TODO: Epic 9 — move subscriber registration to a proper server initialization module`. Add moderation-service import there anyway. All three services move together when TODO is addressed.
- **Serverless caveat (ADR-12):** `globalThis` HMR guard protects dev-mode only. Serverless cold starts each have clean `globalThis`. UNIQUE constraint (ADR-9) is the real duplicate-prevention mechanism.
- **Keyword queue burnout risk (Scenario A pre-mortem):** Starting with ≤20 high-confidence keywords (ADR-11) is critical. A bloated seed list destroys moderator trust in week one.
- **Multiple listeners on same event are safe:** `article.published` is already consumed by `notification-service.ts` and `points-engine.ts`. Adding `moderation-service.ts` as a third listener is correct and expected — EventBus supports multiple listeners per event with no conflict.
- **`content.flagged` is ops-authoritative:** Epic 11 story authors must treat the event shape in ADR-6c as authoritative. No per-story payload fields.

## Review Notes

- Adversarial review completed 2026-03-08
- Findings: 12 total, 10 fixed, 2 documented (F10 architectural, F11 intentional stubs)
- Resolution approach: auto-fix

### Fixes applied

- **F1**: Removed `NOT NULL` from `created_by` in SQL + Drizzle schema (`ON DELETE SET NULL` + `NOT NULL` were contradictory)
- **F2**: Documented `\b` ASCII-only limitation as code comment in `getCachedKeywords()` (known limitation; Unicode-aware boundary is Epic 11+ item)
- **F3**: `getArticleContent()` now returns EN content + Igbo content + Igbo title concatenated (bilingual scan coverage)
- **F4**: Added explicit typed reconstruction after `JSON.parse` in `getCachedKeywords()` (Epic 8 retro AI-2 pattern)
- **F5**: `tiptapJsonToPlainText()` added to `tiptap-to-html.ts`; service uses it on post and article content before scanning
- **F6**: `recordFailureMetric()` wraps `getRedisClient()` in try/catch (prevents throw if Redis is down)
- **F7**: Added `UNIQUE INDEX idx_moderation_keywords_keyword` on `keyword` column in SQL + Drizzle; seed uses `ON CONFLICT (keyword) DO NOTHING`
- **F8**: Removed dead `|| null` from preview assignments; article preview now uses body-only (not concatenated title+body string)
- **F9**: HMR guard flag `__moderationHandlersRegistered = true` moved to AFTER all three `eventBus.on()` calls
- **F10**: Documented as known limitation via code comment (re-publish edited content re-flag gap is deferred to Epic 11 backlog)
- **F11**: Intentional stubs — `ContentUnflaggedEvent` and unflag/hide/unhide `AdminAction` entries are placeholder infrastructure for Epic 11 admin routes
- **F12**: Documented — regex has no `i` flag but is internally consistent (both sides normalized to lowercase before match)
