# Moderation Architecture — Decision Record

**Created:** 2026-03-08
**Status:** Accepted
**Spike completed before:** Epic 11 Story 11.1 authoring

---

## Why Option B? (Flagged Content Remains Visible)

The Obigbo community has a complex history with content suppression. The Igbo language contains vocabulary that naive English-language keyword lists would incorrectly flag — including common greetings, place names, and cultural references that share substrings with English profanity or slurs.

Option A (auto-hide flagged content) was rejected because:

- A false-positive rate above ~2% would harm moderator trust in week one. With a manually-curated keyword list of ≤20 items, false positives are unavoidable before the list is refined.
- Auto-hiding content without human review is equivalent to automated censorship. For a diaspora community built around preserving language and culture, this is unacceptable.
- Reversing a wrongful hide is operationally costly and reputationally damaging.

**Option B chosen:** Flagged content remains visible to all members. Hiding requires an explicit moderator action (`visibility_override = 'hidden'`). This means:

- Existing content query functions (`getPostById`, `getArticleBySlug`, chat message queries) require **no changes**.
- Moderators see a queue of flagged content and choose to hide, dismiss, or escalate.
- Hide/unhide actions notify the content author via `NotificationService` (type: `admin_announcement`).
- Dismissed false-positive flags do **not** notify the author.

---

## Scope of Protection

Keyword scanning is a **tripwire, not a complete moderation solution.** The system surfaces content for human review. The human moderator determines harm — not the system.

**What this system catches:**

- Content containing known high-confidence keywords (exact whole-word match, diacritic-normalized)
- Posts, articles, and chat messages at creation time

**What this system explicitly does NOT catch:**

- Harassment that is relational, not keyword-based (e.g., targeted intimidation without slurs)
- Misinformation, including medical, political, or historical falsehoods
- Coordinated inauthentic behaviour (sock puppets, brigading)
- Novel harmful content not yet in the keyword list
- Edited content after initial publish (re-scan on edit is a future story)
- Images, attachments, or audio

**Complementary mechanisms required for complete governance:**

- Member reporting (Epic 11 backlog)
- Manual admin review queue (Epic 11 Story 11.1+)
- Community guidelines acknowledgement at onboarding (already implemented)

Epic 11 story authors **must not** treat a reviewed flag queue as equivalent to "the platform is fully moderated."

---

## ADR-1: Hook Location

EventBus listeners on `post.published`, `article.published`, and `message.sent` events. The `ModerationService` is a side-effect import in `src/server/jobs/index.ts`, following the same pattern as `notification-service` and `points-engine`.

Exported handlers: `handlePostPublished`, `handleArticleFlaggingCheck`, `handleMessageScanned`.

All handlers are async and run in the background — the HTTP response that triggered the event has already returned before the handler executes. This is the contract.

HMR guard: `globalThis.__moderationHandlersRegistered` prevents double-registration in Next.js development mode hot-reload cycles. This does not protect against serverless cold-start duplicates — ADR-9 (UNIQUE constraint) handles that case.

---

## ADR-2: Keyword Schema — `platform_moderation_keywords`

| Column       | Type                                    | Notes                                                                   |
| ------------ | --------------------------------------- | ----------------------------------------------------------------------- |
| `id`         | UUID PK                                 | gen_random_uuid()                                                       |
| `keyword`    | TEXT NOT NULL                           | Raw keyword text                                                        |
| `category`   | enum                                    | hate_speech / explicit / spam / harassment / other                      |
| `severity`   | enum                                    | low / medium / high (independent of category — Igbo vocabulary context) |
| `notes`      | TEXT nullable                           | Cultural context, rationale                                             |
| `created_by` | UUID FK → auth_users ON DELETE SET NULL | Admin who added the keyword                                             |
| `is_active`  | BOOLEAN DEFAULT true                    | Soft-delete — deactivated keywords preserved for history                |
| `created_at` | TIMESTAMPTZ NOT NULL                    |                                                                         |

**Why soft-delete?** Preserves history for audit. Deleting a keyword would lose the record of why it was added and who reviewed it.

**Why `severity` is independent of `category`?** An Igbo word might be categorised as `hate_speech` at `low` severity because it is a loan word with ambiguous cultural connotation that warrants human review but is unlikely to be genuine hate speech. The severity dimension allows nuanced triage.

---

## ADR-3: Actions Schema — `platform_moderation_actions`

| Column                | Type                 | Notes                                                |
| --------------------- | -------------------- | ---------------------------------------------------- |
| `id`                  | UUID PK              |                                                      |
| `content_type`        | enum                 | post / article / message                             |
| `content_id`          | TEXT NOT NULL        | UUID as text (avoids cross-table FK complexity)      |
| `content_author_id`   | TEXT NOT NULL        | Denormalized — avoids JOIN in admin queue            |
| `content_preview`     | TEXT nullable        | First 200 chars at flag time                         |
| `flagged_at`          | TIMESTAMPTZ          |                                                      |
| `status`              | enum                 | pending / reviewed / dismissed (default pending)     |
| `flag_reason`         | TEXT NOT NULL        | e.g. "Keyword match: [word] (category: hate_speech)" |
| `keyword_matched`     | TEXT nullable        | Exact keyword; null for manual flags (future)        |
| `auto_flagged`        | BOOLEAN DEFAULT true | false = manual admin flag (future Epic 11 route)     |
| `moderator_id`        | UUID nullable FK     | Set when status changes from pending                 |
| `actioned_at`         | TIMESTAMPTZ nullable | When status was last changed                         |
| `visibility_override` | enum                 | visible / hidden (default visible — Option B)        |
| `created_at`          | TIMESTAMPTZ          |                                                      |

**Indexes:**

- `idx_moderation_actions_status_flagged_at ON (status, flagged_at DESC)` — admin queue pagination
- `UNIQUE idx_moderation_actions_content ON (content_type, content_id)` — one flag per content item; INSERT uses `ON CONFLICT DO NOTHING`

---

## ADR-4: Failure Handling (Two-Stage Try/Catch)

Each handler follows this exact pattern:

```
Stage 1: try { keywords = await getCachedKeywords() }
         catch { log JSON + return }           ← bail early, no partial state

Scan:    match = scanContent(content, keywords) // synchronous, no I/O
         if (!match) return

Stage 2: try { action = await insertModerationAction({...}) }
         catch { log JSON
                 redis.incr("moderation:failed:total").catch(() => {})
                 redis.set("moderation:failed:last_error_at", ISO).catch(() => {})
                 return }

Emit:    try { eventBus.emit("content.flagged", {...}) }
         catch { log JSON }                    ← emit failure never throws
```

Rationale: Stage 1 failure (keyword fetch) leaves no partial state — nothing has been written. Stage 2 failure (insert) records failure metrics in Redis for the future health-check route (ADR-10). Emit failure is fire-and-forget at this stage (bridge not yet implemented).

---

## ADR-5: Chat Integration — Feasibility Assessment

**Feasible. Deferred to Epic 11 Story 11.x.**

`message.sent` payload already contains `content: string` — no DB read is needed for message scanning. `ModerationService.handleMessageScanned` is fully implemented and functional today.

What remains for complete chat integration:

1. New `admins` Socket.IO room on the realtime server
2. Auth check on socket join (verify admin role via DB or session token)
3. Bridge handler: `eventBus.on("content.flagged") → socket.to("admins").emit("content:flagged", payload)`
4. Regular member sockets **never** receive `content.flagged` events
5. No optimistic flag rendering in chat UI (flag badge renders only on receipt of socket event)

---

## ADR-6: ModerationService Boundary

**Owns:**

- Keyword scan logic (via `moderation-scanner.ts`)
- Flag record writes (`platform_moderation_actions`)
- `content.flagged` event emission
- Redis keyword cache management

**Does NOT own:**

- Admin UI routes (Epic 11 stories)
- Notification delivery for hide/unhide (NotificationService handles — type: `admin_announcement`)
- Audit logging for moderator actions (admin routes call `logAdminAction()` directly)
- Group leader flag visibility (Epic 11 backlog)

---

## ADR-6b: Scan Algorithm

File: `src/lib/moderation-scanner.ts`

```ts
export interface Keyword {
  keyword: string;
  category: string;
  severity: "low" | "medium" | "high";
}
export function scanContent(text: string, keywords: Keyword[]): Keyword | null;
```

Algorithm:

1. Normalize text: `toLowerCase()` + NFD unicode decomposition + strip combining diacritical marks (U+0300–U+036F)
2. Sort keywords: high → medium → low severity
3. For each keyword: normalize keyword same way, test `\b{normalized}\b` whole-word regex
4. Return first match or `null`

**Why whole-word boundary?** Prevents "classic" matching keyword "ass", "basement" matching "base", etc. Critical for Igbo vocabulary where short English substrings appear inside longer Igbo words.

**Why NFD normalization?** Igbo uses combining diacritics for tone marks. "Ụnọ" (home) normalizes to "uno". This allows keywords to be entered without diacritics and still match diacritic-bearing text.

---

## ADR-6c: Event Shapes

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

**These shapes are authoritative for Epic 11.** No per-story payload fields. Epic 10 retrospective team agreement: moderation event payload invention is prohibited.

---

## ADR-6d: Query Function Signatures

```ts
// src/db/queries/moderation.ts
getActiveKeywords(): Promise<Keyword[]>
insertModerationAction(params): Promise<{ id: string } | null>

// src/db/queries/posts.ts
getPostContent(postId: string): Promise<string | null>

// src/db/queries/articles.ts
getArticleContent(articleId: string): Promise<string | null>
```

---

## ADR-9: Idempotent Flag Insert

`UNIQUE(content_type, content_id)` constraint on `platform_moderation_actions`. INSERT uses `ON CONFLICT (content_type, content_id) DO NOTHING`. One flag per content item — period.

Protects against:

- Multiple keyword matches in the same content (highest-severity keyword is stored; subsequent conflicts are silently ignored)
- Serverless cold-start double-registration of EventBus handlers
- Future manual re-scan routes

---

## ADR-10: Redis Failure Instrumentation

On any catch in moderation handler Stage 2:

- `INCR moderation:failed:total` (never expires — cumulative counter)
- `SET moderation:failed:last_error_at <ISO>` (non-expiring — most recent failure timestamp)

Future health check route `GET /api/v1/admin/health/moderation` (Epic 11 backlog) will expose:

```json
{ "status": "ok|degraded", "failedCount": 0, "lastErrorAt": null, "keywordsLoaded": 20 }
```

---

## ADR-11: Keyword Seed Discipline

≤20 keywords in migration 0042 seed. This is intentional. A bloated seed list destroys moderator trust in week one (Scenario A pre-mortem). The team agreed: start narrow, expand based on actual queue data.

**Native Igbo speaker review required before production migration runs.** Schedule this review before Epic 11 Story 11.1 ships.

---

## ADR-12: HMR Guard Serverless Caveat

`globalThis.__moderationHandlersRegistered` prevents dev-mode double-registration only. In serverless deployments, each cold start has a clean `globalThis` — the guard does not apply. Mitigation: ADR-9 UNIQUE constraint prevents duplicate flag records regardless of how many handler invocations occur.

---

## Deferred Items

| Item                                                                | Owner                     | Status             |
| ------------------------------------------------------------------- | ------------------------- | ------------------ |
| Group leader flag visibility (JOIN on community_posts for group_id) | Epic 11 backlog           | Not started        |
| Self-service appeal UI (launch path = email admin)                  | Post-Epic 11              | Deferred by design |
| Dismissed flag notification (dismissed flags do NOT notify author)  | Confirmed no notification | Done (decision)    |
| Daily reconciliation job (catch EventBus handler failures)          | Epic 11 backlog           | Not started        |
| `severity: low` auto-dismiss                                        | Post-Epic 11              | Not started        |
| Keyword review cadence (quarterly, cultural moderator)              | Team agreement            | Agreed             |
| Health check route `GET /api/v1/admin/health/moderation`            | Epic 11 backlog           | Not started        |
| Bridge `admins` Socket.IO room + auth on join                       | Epic 11 Story 11.x        | Not started        |
| Re-scan on content edit                                             | Post-Epic 11 backlog      | Not started        |

---

## Team Agreements (Epic 10 Retro)

1. Every admin moderation action (flag, unflag, hide, unhide) calls `logAdminAction()` from `audit-logger.ts`. No exceptions.
2. All keyword scan logic lives in `ModerationService` only. No per-story duplicated scan implementations.
3. `content.flagged` event shape (ADR-6c) is authoritative. No per-story payload fields added without updating the ADR.
4. `AdminAction` union in `audit-logger.ts` now includes: `FLAG_CONTENT | UNFLAG_CONTENT | HIDE_CONTENT | UNHIDE_CONTENT`.
