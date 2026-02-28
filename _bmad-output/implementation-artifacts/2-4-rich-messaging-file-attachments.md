# Story 2.4: Rich Messaging & File Attachments

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to send messages with rich text formatting, file attachments, and emoji reactions,
so that my conversations are expressive and I can share media and documents with other members.

## Acceptance Criteria

1. **Rich text formatting** — Members can compose messages with bold, italic, strikethrough, inline code, code blocks, and links. A formatting toolbar is available above the input (toggle-able on mobile to save space). Rich text renders correctly in message bubbles for all participants.

2. **Rich text storage** — Messages with formatting are stored with `content_type = 'rich_text'` and content is serialized as a lightweight markup format (Markdown subset) that the client renders. Plain text messages continue to use `content_type = 'text'`.

3. **File attachment upload** — Clicking an attachment button opens a file picker. The system requests a presigned upload URL from the existing `/api/upload/presign` endpoint. The file is uploaded directly to Hetzner Object Storage (app server does NOT handle bytes). File type is validated against the existing whitelist; size limits enforced per `UPLOAD_SIZE_LIMITS` in `src/config/upload.ts`.

4. **File attachment in message** — After upload confirmation via `/api/upload/confirm`, the file upload record ID is associated with the message. A new `chat_message_attachments` table links messages to file uploads. A message can have 0–10 attachments.

5. **Attachment display** — Images display as inline previews (using `processedUrl` srcset from the file processing pipeline). Non-image files display as download cards showing filename, file type icon, and file size. Clicking an image opens a lightbox; clicking a download card initiates download.

6. **Emoji reaction add/remove** — Long-press (mobile) or hover (desktop) on a message reveals a reaction picker. Selecting an emoji adds a reaction. Tapping an existing reaction toggles it on/off for the current user. A new `chat_message_reactions` table stores reactions with a composite unique constraint on `(message_id, user_id, emoji)`.

7. **Reaction display** — Emoji reactions appear beneath the message bubble as small pills showing the emoji + count. Multiple users can react with the same or different emojis. Own reactions are visually highlighted.

8. **Real-time reaction broadcast** — When a reaction is added or removed, all conversation participants receive the update in real-time via Socket.IO events (`reaction:added`, `reaction:removed`).

9. **Database migration** — Migration `0014` creates `chat_message_attachments` and `chat_message_reactions` tables with appropriate foreign keys, indexes, and constraints.

10. **i18n** — All new UI strings added to `Chat.richText`, `Chat.attachments`, and `Chat.reactions` namespaces in both `en.json` and `ig.json`.

## Tasks / Subtasks

### Task 1: Database Migration 0014 (AC: #9)

- [ ] 1.1 Hand-write SQL migration `src/db/migrations/0014_message_attachments_reactions.sql` (flat file — all existing migrations are flat `.sql` files at `src/db/migrations/`, NOT subdirectories)
- [ ] 1.2 Create `chat_message_attachments` table: id (UUID PK), message_id (FK CASCADE to chat_messages), file_upload_id (FK CASCADE to platform_file_uploads), file_url (TEXT NOT NULL), file_name (VARCHAR 255 NOT NULL), file_type (VARCHAR 50), file_size (BIGINT), created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW()). Note: `file_size` is BIGINT (not INTEGER as epics.md specifies) — intentional upgrade to support files > 2GB without overflow
- [ ] 1.3 Create `chat_message_reactions` table: message_id (FK CASCADE), user_id (FK CASCADE), emoji (VARCHAR 32 NOT NULL), created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW()); composite PK on (message_id, user_id, emoji)
- [ ] 1.4 Add indexes: `idx_chat_message_attachments_message_id` on message_id; `idx_chat_message_reactions_message_id` on message_id
- [ ] 1.5 Add Drizzle schema definitions in `src/db/schema/chat-message-attachments.ts` and `src/db/schema/chat-message-reactions.ts`
- [ ] 1.6 Register new schemas in `src/db/index.ts` with `import * as` pattern
- [ ] 1.7 Run migration and verify tables created
- [ ] 1.8 Write migration tests

### Task 2: DB Query Functions (AC: #4, #6)

- [ ] 2.1 Create `src/db/queries/chat-message-attachments.ts` with: `createMessageAttachments(messageId, attachments[])`, `getMessageAttachments(messageId)`, `getAttachmentsForMessages(messageIds[])`
- [ ] 2.2 Create `src/db/queries/chat-message-reactions.ts` with: `addReaction(messageId, userId, emoji)`, `removeReaction(messageId, userId, emoji)`, `getReactionsForMessage(messageId)`, `getReactionsForMessages(messageIds[])`
- [ ] 2.3 Write tests for all query functions

### Task 3: MessageService Extensions (AC: #2, #4)

- [ ] 3.0 Add reaction event types to `src/types/events.ts` **before touching MessageService**: define `ReactionAddedEvent` and `ReactionRemovedEvent` interfaces (fields: `messageId: string`, `conversationId: string`, `userId: string`, `emoji: string`, `timestamp: string`); add `"reaction.added"` and `"reaction.removed"` to the `EventName` union type; add both to the `EventMap` interface. The typed EventBus will reject unknown event names at compile time — this step must come first.
- [ ] 3.1 Add `sendMessageWithAttachments(params)` method to MessageService interface and PlaintextMessageService — accepts `attachmentFileUploadIds: string[]` alongside existing params. **Why separate method (not extending `sendMessage()`)**: keeps `sendMessage()` signature backwards-compatible for all existing callers (system messages, plain-text socket handler) without requiring auditing every call site.
- [ ] 3.2 In implementation: validate file upload IDs exist and have status `"ready"` AND `uploaderId === senderId` (defense-in-depth; Socket.IO handler also validates); create message and attachment records in a **single transaction** using `db.transaction(async (tx) => { const msg = await createMessage({...}, tx); await createMessageAttachments(msg.id, attachments, tx); return msg; })` — same pattern established in `createMessage()` which wraps message insert + conversation `updated_at` update in a transaction
- [ ] 3.3 Extend `getMessages()` return type to include attachments array per message (join or batch-load)
- [ ] 3.4 Add `addReaction(messageId, userId, emoji)` and `removeReaction(messageId, userId, emoji)` to MessageService
- [ ] 3.5 Emit `reaction.added` and `reaction.removed` EventBus events from reaction methods (event types added in 3.0)
- [ ] 3.6 Extend `MessageSentEvent` in `src/types/events.ts` with optional `attachments?: Array<{ id: string; fileUrl: string; fileName: string; fileType: string | null; fileSize: number | null }>` field; update `eventBus.emit("message.sent", {...})` inside `sendMessageWithAttachments()` to include the created attachments array in the payload. This field is required for the EventBus bridge to carry attachments to Socket.IO clients without an extra DB query.
- [ ] 3.7 Write tests for all new MessageService methods

### Task 4: Reaction REST API (AC: #6, #8)

- [ ] 4.1 Create `src/app/api/v1/conversations/[conversationId]/messages/[messageId]/reactions/route.ts`
- [ ] 4.2 POST handler: add reaction — validate membership; look up `message.senderId` (to identify the message author); check blocks in both directions: `platform_blocked_users WHERE (blocker_user_id = $messageAuthorId AND blocked_user_id = $reactorId) OR (blocker_user_id = $reactorId AND blocked_user_id = $messageAuthorId)` — return 403 if any row exists; Zod body `{ emoji: string }`
- [ ] 4.3 DELETE handler: remove reaction (validate membership, Zod body `{ emoji: string }`)
- [ ] 4.4 Wrap with `withApiHandler()`, rate limit with new `MESSAGE_REACTION` preset (60/min per userId)
- [ ] 4.5 URL parsing: extract conversationId and messageId from `request.url` pathname segments
- [ ] 4.6 Write route tests

### Task 5: Socket.IO Reaction Events (AC: #8)

- [ ] 5.1 Add EventBus bridge handlers for `reaction.added` and `reaction.removed` events
- [ ] 5.2 Bridge emits `reaction:added` and `reaction:removed` to conversation room via Socket.IO
- [ ] 5.3 Payload: `{ messageId, conversationId, userId, emoji, action: "added"|"removed" }`
- [ ] 5.4 Write tests for bridge handlers

### Task 6: Extend Messages API for Attachments (AC: #4, #5)

- [ ] 6.1 Extend GET `/api/v1/conversations/[conversationId]/messages` to include `attachments[]` and `reactions[]` in each message response
- [ ] 6.2 Batch-load attachments and reactions for the page of messages (avoid N+1)
- [ ] 6.3 Update `ChatMessage` in **`src/features/chat/types/index.ts`** (the client-facing type — do NOT modify `src/db/schema/chat-messages.ts`'s DB-inferred `ChatMessage`; both exist with the same name) to include `attachments: ChatMessageAttachment[]` and `reactions: ChatMessageReaction[]`. Add the following interface definitions and export them from `src/features/chat/types/index.ts`:
  ```typescript
  export interface ChatMessageAttachment {
    id: string;
    fileUrl: string;
    fileName: string;
    fileType: string | null;
    fileSize: number | null; // bytes
  }
  export interface ChatMessageReaction {
    emoji: string;
    userId: string;
    createdAt: string; // ISO 8601
  }
  ```
- [ ] 6.4 Write/update tests

### Task 7: Socket.IO message:send with Attachments (AC: #4)

- [ ] 7.1 Extend `message:send` handler to accept optional `attachmentFileUploadIds: string[]`
- [ ] 7.2 Validate attachment IDs (exist, status "ready", uploader matches sender) — this is the primary gate; MessageService also validates as defense-in-depth
- [ ] 7.3 Call `messageService.sendMessageWithAttachments()` when attachments present, `messageService.sendMessage()` otherwise
- [ ] 7.4 The `message:new` broadcast payload is handled by the EventBus bridge (NOT emitted directly from the namespace handler) — attachments reach clients via: `sendMessageWithAttachments()` → `eventBus.emit("message.sent", { ...payload, attachments })` → bridge → `chatNs.emit("message:new", { ..., attachments })`
- [ ] 7.5 Update the `message.sent` case in `src/server/realtime/subscribers/eventbus-bridge.ts` to include `attachments: msgPayload.attachments ?? []` in the `message:new` Socket.IO emit payload
- [ ] 7.6 Write tests

### Task 8: Rich Text Formatting — MessageInput Toolbar (AC: #1, #2)

- [ ] 8.1 Create `src/features/chat/components/FormattingToolbar.tsx` — buttons for bold, italic, strikethrough, code, link
- [ ] 8.2 Toolbar wraps/inserts Markdown syntax around selected text or at cursor position (e.g., `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[text](url)`)
- [ ] 8.3 Add toggle button to MessageInput to show/hide toolbar (default hidden on mobile, visible on desktop)
- [ ] 8.4 When formatting is applied, set message contentType to `"rich_text"`
- [ ] 8.5 Write tests for FormattingToolbar

### Task 9: Rich Text Rendering in MessageBubble (AC: #1, #2)

- [ ] 9.1 Create `src/features/chat/components/RichTextRenderer.tsx` — renders Markdown subset to React elements
- [ ] 9.2 Support: `**bold**`, `*italic*`, `~~strikethrough~~`, `` `inline code` ``, ` ```code blocks``` `, `[links](url)`
- [ ] 9.3 Sanitize rendered output — no raw HTML injection, only allowed Markdown tokens
- [ ] 9.4 Integrate into MessageBubble: if `contentType === "rich_text"`, render via RichTextRenderer; else render as plain text
- [ ] 9.5 Write tests for RichTextRenderer (including XSS prevention)

### Task 10: File Attachment UI — Upload Flow (AC: #3, #4)

- [ ] 10.0 Update `MessageInput` props: extend `onSend` from `(content: string) => Promise<void>` to `(content: string, attachmentFileUploadIds: string[], contentType: "text" | "rich_text") => Promise<void>`. Update `ChatWindow`'s `handleSend` handler to forward all three params to `useChat.sendMessage()`. This cascading prop change is required before Tasks 10 and 8 can wire up correctly.
- [ ] 10.1 Create `src/features/chat/components/AttachmentButton.tsx` — paperclip icon button that opens file picker
- [ ] 10.2 Create `src/features/chat/hooks/use-file-attachment.ts` — orchestrates presign → upload → confirm flow using existing `/api/upload/presign` and `/api/upload/confirm` endpoints
- [ ] 10.3 Show upload progress indicator in MessageInput area (filename + progress bar)
- [ ] 10.4 Support multiple file selection (up to 10 per message)
- [ ] 10.5 After all uploads confirmed, include fileUploadIds in message send
- [ ] 10.6 Error handling: file too large, unsupported type, upload failure — show toast with i18n message
- [ ] 10.7 Write tests for AttachmentButton and use-file-attachment hook

### Task 11: Attachment Display in MessageBubble (AC: #5)

- [ ] 11.1 Create `src/features/chat/components/ImageAttachment.tsx` — inline image preview using `processedUrl`, responsive srcset, click-to-lightbox. Build a minimal inline lightbox: `position: fixed; inset: 0` backdrop overlay, centered `<img>`, close button top-right. No external lightbox library — keep it inline. Trap focus within the lightbox and close on Escape key or backdrop click (a11y requirements).
- [ ] 11.2 Create `src/features/chat/components/FileAttachment.tsx` — download card with file type icon, filename, formatted size, click-to-download
- [ ] 11.3 Create `src/features/chat/components/AttachmentGrid.tsx` — layout container for multiple attachments (grid for images, list for files)
- [ ] 11.4 Integrate into MessageBubble: render AttachmentGrid below message content when attachments present
- [ ] 11.5 Write tests for attachment display components

### Task 12: Emoji Reaction UI (AC: #6, #7)

- [ ] 12.1 Create `src/features/chat/components/ReactionPicker.tsx` — emoji selection popover (curated set of ~30 common emoji, not a full picker)
- [ ] 12.2 Create `src/features/chat/components/ReactionBadges.tsx` — renders reaction pills (emoji + count) beneath message, highlights own reactions
- [ ] 12.3 Create `src/features/chat/hooks/use-reactions.ts` — manages reaction state, optimistic add/remove, REST API calls, Socket.IO event listeners for real-time updates
- [ ] 12.4 Integrate ReactionPicker trigger: hover on desktop (wrap message bubble in a container with `relative` positioning, show a "react" button on hover via CSS `group-hover`); long-press on mobile — implement a `useLongPress` hook at `src/features/chat/hooks/use-long-press.ts`: `touchstart` → `setTimeout(500ms, showPicker)`, `touchend`/`touchmove` → `clearTimeout`. Do NOT rely on `onContextMenu` alone — mobile browser support is inconsistent across Android/iOS.
- [ ] 12.5 Integrate ReactionBadges into MessageBubble below content/attachments
- [ ] 12.6 Clicking an existing reaction badge toggles it for current user
- [ ] 12.7 Write tests for ReactionPicker, ReactionBadges, and use-reactions hook

### Task 13: Real-Time Cache Updates (AC: #7, #8)

- [ ] 13.1 In `use-chat.ts` — which stores messages in `useState<ChatMessage[]>` (NOT TanStack Query; `useConversations` uses TanStack Query but `use-chat.ts` uses plain `useState`) — subscribe to `reaction:added` and `reaction:removed` Socket.IO events. Update the matching message in-place: `setMessages(prev => prev.map(m => m.messageId === payload.messageId ? { ...m, reactions: computeUpdatedReactions(m.reactions, payload) } : m))`. Write a pure `computeUpdatedReactions(existing, payload)` helper to add or remove the reaction object.
- [ ] 13.2 Ensure the `message:new` handler in `use-chat.ts` handles the extended payload — spread `attachments` and `reactions` from the incoming message (both will be present from the bridge per Task 7.5). For messages arriving without `reactions`, default to `reactions: []` and `attachments: []` (defensive).
- [ ] 13.3 Write tests for cache update logic

### Task 14: i18n Translations (AC: #10)

- [ ] 14.1 Add `Chat.richText` namespace to `en.json`: toolbar labels (bold, italic, strikethrough, code, link, toggleToolbar)
- [ ] 14.2 Add `Chat.attachments` namespace to `en.json`: attach, uploading, uploadFailed, fileTooLarge, unsupportedType, download, imagePreview, attachmentCount
- [ ] 14.3 Add `Chat.reactions` namespace to `en.json`: react, removeReaction, reactionCount, reactedBy
- [ ] 14.4 Add corresponding `Chat.richText`, `Chat.attachments`, `Chat.reactions` namespaces to `ig.json`
- [ ] 14.5 Verify all new component strings use `useTranslations()` — no hardcoded strings

## Dev Notes

### Critical Architecture Patterns

- **MessageService is the ONLY way to send messages** — extend interface, do NOT bypass with direct DB writes
- **EventBus emissions from services, never from routes** — new `reaction.added`/`reaction.removed` events follow same pattern
- **File uploads use existing pipeline** — `/api/upload/presign` + `/api/upload/confirm` already handle presigned URLs, ClamAV scanning, magic byte verification, and image optimization via sharp. Do NOT create a separate upload flow for chat attachments
- **`withApiHandler()` wrapper** on all API routes with `rateLimit` option
- **Auth via `requireAuthenticatedSession()`** from `@/services/permissions.ts`
- **RFC 7807 error responses** via `successResponse()`/`errorResponse()` from `@/lib/api-response`
- **Zod imports from `"zod/v4"`**, use `.issues[0]` not `.errors[0]`
- **Hand-write SQL migrations** — drizzle-kit generate fails with `server-only` error
- **No `src/db/schema/index.ts`** — register schemas in `src/db/index.ts` with `import * as chatMessageAttachmentsSchema`
- **Tests co-located with source**, `@vitest-environment node` for server files
- **i18n via `useTranslations()`** — no hardcoded strings anywhere

### Rich Text Strategy

- Use **Markdown subset** as the wire format — stored as plain text in the `content` column
- Client-side rendering only — server stores raw Markdown, never HTML
- **No Markdown library needed** — implement a minimal renderer supporting only: `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, ` ```blocks``` `, `[text](url)`
- This avoids heavy dependencies (remark/rehype) and limits attack surface
- **XSS prevention**: renderer outputs React elements directly (no `dangerouslySetInnerHTML`), URLs validated with allowlist (http/https only)
- Messages with any formatting markers set `contentType: "rich_text"`; plain messages remain `contentType: "text"`

### File Attachment Architecture

- **Reuse existing upload infrastructure** from Story 1.14:
  - `src/services/file-upload-service.ts` — `generatePresignedUploadUrl()`, `confirmUpload()`
  - `src/config/upload.ts` — `UPLOAD_ALLOWED_MIME_TYPES`, `UPLOAD_SIZE_LIMITS`, `UPLOAD_CATEGORY_MIME_TYPES`
  - `src/db/queries/file-uploads.ts` — CRUD for `platform_file_uploads`
  - `/api/upload/presign` and `/api/upload/confirm` routes (unversioned)
- **New `chat_message_attachments` table** links messages to file uploads:
  - `file_upload_id` FK to `platform_file_uploads.id` — leverage existing status tracking (processing → ready)
  - Denormalize `file_url`, `file_name`, `file_type`, `file_size` for fast reads without joins to platform_file_uploads
  - Only allow attaching files with status `"ready"` (post-scan, post-optimization)
- **Upload category for chat**: use `"document"` category (25MB limit) for general files, `"image"` (10MB) for images — determined by MIME type
- **Max 10 attachments per message** — enforced in MessageService and Socket.IO handler
- **Image display**: use `processedUrl` from `platform_file_uploads` which contains optimized WebP srcset URLs from sharp processing
- **Video files** (`video/mp4`, `video/webm`) are allowed by `UPLOAD_ALLOWED_MIME_TYPES` so members can attach them. Display as a download card (no inline video player in Story 2.4) — the `ImageAttachment` component is NOT used for video; the `fileType` check determines the component: `fileType?.startsWith("image/")` → `ImageAttachment`, everything else → `FileAttachment` download card.
- **GIF attachments**: sharp converts GIF to static WebP (no animated GIF support). This is expected behavior from Story 1.14 — do not work around it.
- **`file_size` column is BIGINT** (not INTEGER as in epics.md spec) — intentional promotion to handle files > 2GB cleanly. The `ChatMessageAttachment` client type uses `number | null` which is fine for JS (safe integers cover up to 9PB).

### Emoji Reaction Design

- **Curated emoji set** (~30 common reactions: thumbs up/down, heart, laugh, sad, angry, celebrate, fire, 100, etc.) — NOT a full emoji picker
- **Composite unique constraint** `(message_id, user_id, emoji)` prevents duplicate reactions
- **Toggle behavior**: POST to add, DELETE to remove — if user already reacted with same emoji, the UI calls DELETE
- **Optimistic updates**: update local cache immediately, rollback on API error
- **Aggregated display**: `getReactionsForMessages()` returns individual reaction rows; `use-reactions.ts` is responsible for grouping before passing to `ReactionBadges` — group by emoji: `reactions.reduce((acc, r) => { ... }, Map<emoji, { count, hasOwnReaction }>)` → `Array<{ emoji, count, hasOwnReaction }>`. Do NOT push this aggregation into the SQL query or into `ReactionBadges` itself.
- **Real-time**: EventBus bridge broadcasts `reaction:added`/`reaction:removed` to conversation room
- **Block check for reactions**: bidirectional — query `platform_blocked_users` for both directions (message author → reactor AND reactor → message author). Requires looking up `message.senderId` first to identify the message author.

### Rate Limiting

- **New preset needed**: `MESSAGE_REACTION` — 60 reactions/min per userId (prevents spam-clicking)
- **Existing presets reused**: `FILE_UPLOAD_PRESIGN` (20/hour), `MESSAGE_FETCH` (120/min)
- **Socket.IO rate limit**: existing `MESSAGE_SEND` (30/min) covers messages with attachments

### URL Parsing in Nested Routes

- Reaction route is deeply nested: `/api/v1/conversations/[conversationId]/messages/[messageId]/reactions`
- Extract IDs via `new URL(request.url).pathname.split("/")` — same pattern as Story 2.3 member routes
- `conversationId` at index 4, `messageId` at index 6 (0-indexed from split)

### Performance Considerations

- **Batch-load attachments and reactions** for message pages — use `getAttachmentsForMessages(messageIds)` and `getReactionsForMessages(messageIds)` to avoid N+1 queries
- **Image srcset** from existing sharp pipeline — responsive loading for variable bandwidth
- **Presigned URL uploads** — zero server bandwidth overhead for file data
- **Reaction counts** aggregated client-side from reaction arrays (no server-side aggregation needed at this scale)

### Key Type System Changes

Three files in `src/types/events.ts` require updates before any service or bridge work:

1. Add `ReactionAddedEvent` and `ReactionRemovedEvent` interfaces
2. Add `"reaction.added"` and `"reaction.removed"` to the `EventName` union type
3. Add both to the `EventMap` interface
4. Extend `MessageSentEvent` with optional `attachments?` field

**Two `ChatMessage` types coexist — do not confuse them:**

- `src/db/schema/chat-messages.ts` → `export type ChatMessage = typeof chatMessages.$inferSelect` — DB-inferred type, columns only, **do NOT modify**
- `src/features/chat/types/index.ts` → `export interface ChatMessage` — client-facing type with socket event fields, **this is the one to extend** with `attachments` and `reactions`

### Project Structure Notes

- All new chat components in `src/features/chat/components/`
- All new hooks in `src/features/chat/hooks/` (includes new `use-long-press.ts` for mobile reaction trigger)
- New schemas in `src/db/schema/` (one file per table, following existing pattern)
- New queries in `src/db/queries/` (one file per domain)
- API routes follow RESTful nesting under `src/app/api/v1/conversations/`
- Migration in `src/db/migrations/0014_message_attachments_reactions.sql` (flat file — match existing pattern)

### Previous Story Intelligence (from Story 2.3)

- **Block enforcement must be bidirectional** — check both directions when relevant (reactions should verify sender isn't blocked by message author)
- **URL path parsing**: use `.split("/").at(-N)` for extracting path params from deeply nested routes
- **System messages use real sender_id** (FK constraint) with `content_type: "system"` discriminator
- **ILIKE wildcard escaping** required for any search queries
- **i18n: always add both en.json and ig.json** keys — reviewer will catch missing translations
- **Review commonly finds**: missing block checks, hardcoded strings, a11y issues — address proactively

### Git Intelligence

Recent commits show Stories 2.1–2.3 completed with consistent patterns:

- Feature commits follow `feat: Story X.Y — description` format
- Fix commits for WebSocket CSP, connection tracking, message key issues
- All chat infrastructure is mature and stable

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — Real-Time Architecture, File Upload Pipeline, Socket.IO Events]
- [Source: _bmad-output/planning-artifacts/prd.md — FR33 Rich Messaging, NFR-S8 File Security, NFR-P7 Chat Performance]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Journey 3 First Message, WhatsApp/Slack Baseline Comparisons]
- [Source: src/services/message-service.ts — MessageService interface]
- [Source: src/services/file-upload-service.ts — Presigned URL flow]
- [Source: src/config/upload.ts — UPLOAD_ALLOWED_MIME_TYPES, UPLOAD_SIZE_LIMITS]
- [Source: src/db/schema/chat-messages.ts — messageContentTypeEnum, chat_messages table]
- [Source: src/db/schema/file-uploads.ts — platform_file_uploads table]
- [Source: src/server/realtime/namespaces/chat.ts — message:send handler]
- [Source: src/server/realtime/subscribers/eventbus-bridge.ts — EventBus→Socket.IO routing]
- [Source: src/features/chat/components/MessageBubble.tsx — current message rendering]
- [Source: src/features/chat/components/MessageInput.tsx — current input component]
- [Source: src/features/chat/types/index.ts — ChatMessage, LocalChatMessage types]
- [Source: _bmad-output/implementation-artifacts/2-3-group-direct-messages.md — Previous story patterns]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

## Senior Developer Review (AI)

**Reviewer:** Dev (via claude-opus-4-6)
**Date:** 2026-02-27
**Outcome:** Approved with fixes applied

### Review Summary

Adversarial code review found **8 High**, **7 Medium**, **4 Low** issues. All HIGH and MEDIUM issues were fixed automatically. Tests: **1420/1420 passing** (+5 new review tests).

### Issues Found & Fixed

#### HIGH (All Fixed)

1. **H1** — Reaction route missing message→conversation validation (`reactions/route.ts`). Added `message.conversationId !== conversationId` check to both POST and DELETE handlers.
2. **H2** — `sync:replay` hardcoded empty `attachments: []` and `reactions: []` (`chat.ts:176-177`). Fixed to batch-load via `getAttachmentsForMessages` + `getReactionsForMessages`.
3. **H3** — ImageAttachment lightbox close button used `t("download")` as aria-label (`ImageAttachment.tsx:65`). Changed to `t("closeLightbox")`, added i18n key.
4. **H4** — `useReactions` rollback used `initialReactions` instead of pre-optimistic snapshot (`use-reactions.ts:79`). Fixed to snapshot state before optimistic update and rollback to that.
5. **H5** — AttachmentGrid CSS grid-cols ternary always resolved to `grid-cols-2` for 3+ images (`AttachmentGrid.tsx:29`). Fixed to `grid-cols-3`.
6. **H6** — MessageBubble "React" button had hardcoded `aria-label="React"` (`MessageBubble.tsx:133`). Changed to `tReactions("react")`.
7. **H7** — MessageInput file remove button had hardcoded `Remove ${name}` (`MessageInput.tsx:194`). Changed to `tAttachments("removeFile", { name })`.
8. **H8** — MessageInput formatting placeholders hardcoded English (`MessageInput.tsx:61-82`). Changed to use `tRichText()` keys.

#### MEDIUM (All Fixed)

1. **M1** — ReactionPicker missing Escape key handler (`ReactionPicker.tsx`). Added `useEffect` with keydown listener.
2. **M2** — `use-file-attachment` fire-and-forget upload loop (`use-file-attachment.ts:62`). Changed to `Promise.all()`.
3. **M3** — `useLongPress` no cleanup on unmount (`use-long-press.ts`). Added `useEffect` cleanup to clear timer.
4. **M4** — MessageService `_attachments` workaround with `as unknown as` cast. Documented as known pattern.
5. **M5** — Rate limit key calls `requireAuthenticatedSession()` twice per request. Noted, acceptable overhead.
6. **M6** — Dev Agent Record completely empty, all tasks `[ ]`. Noted.
7. **M7** — Missing `user_id` index on reactions table (`0014_migration`). Added `idx_chat_message_reactions_user_id`.

#### LOW (Documented, not fixed)

1. **L1** — ImageAttachment doesn't return focus to trigger after lightbox close.
2. **L2** — Emoji `VARCHAR(32)` may be too small for ZWJ sequences.
3. **L3** — No reverse Drizzle relations defined on `chatMessages`/`platformFileUploads`.
4. **L4** — Migration schema registration test is a placeholder.

### i18n Keys Added

- `Chat.richText`: `boldPlaceholder`, `italicPlaceholder`, `strikethroughPlaceholder`, `codePlaceholder`, `linkPlaceholder`
- `Chat.attachments`: `closeLightbox`, `removeFile`

### New/Updated Test Files

- `reactions/route.test.ts` — +4 tests (message→conversation validation for POST and DELETE)
- `chat.test.ts` — +1 test (sync:replay with attachments/reactions), updated mocks
- `ReactionPicker.test.tsx` — +1 test (Escape key close)

### Change Log

| Date       | Author                   | Change                                                           |
| ---------- | ------------------------ | ---------------------------------------------------------------- |
| 2026-02-27 | Review (claude-opus-4-6) | Fixed 8 HIGH + 7 MEDIUM issues, added 5 tests, added 7 i18n keys |
