# Story P-5.4: File Sharing in Messages

Status: done

<!-- Portal Epic 5, Story 4. Depends on P-5.1A (done — migration 0074, portal conversation queries), P-5.1B (done — ConversationService, API routes, EventBus emission), P-5.2 (done — /portal namespace, eventbus-bridge routing, SocketProvider, messaging UI), P-5.3 (done — read receipts, typing indicators, MessageStatus "read"). This story adds file attachment support to portal messaging — users can share CVs, portfolio documents, and images within application-linked conversation threads. -->

## Story

As an employer or job seeker,
I want to share files (CVs, portfolio documents, images) within message threads,
So that I can exchange relevant documents in the context of our conversation.

## Acceptance Criteria

1. **File attachment button in MessageInput.** A paperclip/attachment icon appears in the message composer. Clicking opens a native file picker. Allowed types: PDF (.pdf), Word (.doc, .docx), images (.png, .jpg, .jpeg, .webp), plain text (.txt). Max 10MB per file. Max 3 files per message.

2. **File upload via existing infrastructure.** Files upload through the portal's existing `/api/v1/upload/file` route (extended to accept message-appropriate file types and sizes). Files are stored via S3 with UUID-based keys (`portal/messages/{userId}/{uuid}.{ext}`). The `platformFileUploads` table records each upload. Upload status must be `ready` before the message is sent.

3. **Message with attachments — atomic persistence.** When sending a message with files, the message record and `chatMessageAttachments` records are created in a single DB transaction. If the transaction fails, neither the message nor attachments are persisted. The existing `createMessageAttachments(messageId, attachments, tx)` query function is reused.

4. **Attachment display in MessageBubble.** Messages with attachments render a file list below the text content. Each file shows: filename (truncated if long), file size (human-readable), file type icon (PDF/document/image), and a download link. Image attachments show an inline thumbnail preview. Non-image files show a file-type icon with download button.

5. **Download requires authentication.** File download URLs are not publicly accessible. Downloads go through a portal API route (`GET /api/v1/upload/download/{fileUploadId}`) that validates the user is a participant in the conversation before generating a signed S3 URL (5-minute expiry) and returning a 302 redirect. Non-participants receive 404 (not 403, per 404-not-403 invariant).

6. **Upload progress and error states.** While files are uploading, a progress bar or indicator is shown per file. If upload fails, an error message appears with option to retry or remove the file. The message cannot be sent until all uploads succeed or are removed.

7. **Read-only conversations block file sharing.** When a conversation is read-only (terminal application state), the file attachment button is hidden along with the message input.

8. **Real-time delivery includes attachments.** When a message with attachments is delivered via Socket.IO `message:new`, the payload includes attachment metadata (id, fileName, fileType, fileSize, fileUrl). Recipients see the attachments immediately without re-fetching.

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

### i18n Key Inventory

- [ ] **Portal.messages.* keys needed** (all in `apps/portal/messages/en.json` and `ig.json`):
  - `Portal.messages.attachFile` — "Attach file"
  - `Portal.messages.attachments` — "Attachments"
  - `Portal.messages.fileUploading` — "Uploading..."
  - `Portal.messages.fileUploadFailed` — "Upload failed"
  - `Portal.messages.fileTooLarge` — "File exceeds 10MB limit"
  - `Portal.messages.unsupportedType` — "File type not supported. Accepted: PDF, Word, images, text"
  - `Portal.messages.maxFilesReached` — "Maximum 3 files per message"
  - `Portal.messages.download` — "Download"
  - `Portal.messages.removeFile` — "Remove file"
  - `Portal.messages.retryUpload` — "Retry upload"
  - `Portal.messages.fileSizeBytes` — "{size} B"
  - `Portal.messages.fileSizeKb` — "{size} KB"
  - `Portal.messages.fileSizeMb` — "{size} MB"

### Sanitization Points

- [ ] **File names**: Sanitize `originalFilename` display — truncate long names, escape any HTML entities. No `dangerouslySetInnerHTML`. File names rendered as text content only.

### Accessibility Patterns

- [ ] File attachment button: `aria-label` with i18n key, visible focus ring
- [ ] Upload progress: `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`
- [ ] File list in message: `role="list"` with `role="listitem"` for each attachment
- [ ] Download links: `aria-label` including filename for screen readers
- [ ] Image thumbnails: `alt` attribute on `<img>` — use filename or localized "Image preview of {filename}" string (axe `image-alt` rule)

### Component Dependencies

- [ ] No new shadcn/ui components needed — use existing Button, standard HTML input[type=file]
- [ ] **`@aws-sdk/s3-request-presigner` must be added** to portal deps (`pnpm --filter portal add @aws-sdk/s3-request-presigner`). Not currently in `apps/portal/package.json`. Required for download route signed URLs.

### Codebase Verification

- [ ] All referenced DB functions verified against current source
- [ ] All referenced file paths verified to exist (or explicitly marked as new files)
- [ ] All referenced TypeScript types/interfaces verified against current source

- Verified references:
  - `chatMessageAttachments` schema — verified at `packages/db/src/schema/chat-message-attachments.ts:6`
  - `createMessageAttachments(messageId, attachments, tx)` — verified at `packages/db/src/queries/chat-message-attachments.ts:21`
  - `getAttachmentsForMessages(messageIds)` — verified at `packages/db/src/queries/chat-message-attachments.ts:47`
  - `getMessageAttachments(messageId)` — verified at `packages/db/src/queries/chat-message-attachments.ts:36`
  - `createFileUpload(data)` — verified at `packages/db/src/queries/file-uploads.ts:9`
  - `getFileUploadById(id)` — verified at `packages/db/src/queries/file-uploads.ts:39`
  - `platformFileUploads` schema — verified at `packages/db/src/schema/file-uploads.ts`
  - Portal upload route — verified at `apps/portal/src/app/api/v1/upload/file/route.ts`
  - `getPortalS3Client()` — verified at `apps/portal/src/lib/s3-client.ts:7`
  - `UPLOAD_ALLOWED_MIME_TYPES` — verified at `packages/config/src/upload.ts:5`
  - `UPLOAD_SIZE_LIMITS` — verified at `packages/config/src/upload.ts:40`
  - `SendPortalMessageParams` — verified at `apps/portal/src/services/conversation-service.ts:35`
  - `sendMessage()` service — verified at `apps/portal/src/services/conversation-service.ts:118`
  - `PortalMessage` type — verified at `apps/portal/src/hooks/use-portal-messages.ts:9`
  - `MessageBubble` — verified at `apps/portal/src/components/messaging/MessageBubble.tsx`
  - `MessageInput` — verified at `apps/portal/src/components/messaging/MessageInput.tsx`
  - `ConversationThread` — verified at `apps/portal/src/components/messaging/ConversationThread.tsx`
  - Community `use-file-attachment.ts` — verified at `apps/community/src/features/chat/hooks/use-file-attachment.ts`
  - Community `sendMessageWithAttachments` — verified at `apps/community/src/services/message-service.ts:194`

### Story Sizing Check

- [ ] System axes count: **4** (upload route extension + service-layer attachment handling, client-side upload hook + UI, MessageBubble attachment rendering, download route)
- [ ] Justification: Upload infrastructure exists (route, S3 client, DB schema). Community `use-file-attachment.ts` provides hook template (note: `clearAll()` is net-new — community hook does NOT have it). `chatMessageAttachments` schema + queries exist — no migration. Two new DB queries needed for download route (see Task 5). Attachment transaction pattern established in community `sendMessageWithAttachments`. ~70 new tests expected.

### Agent Model Selection

- [ ] Agent model selected: `claude-opus-4-6`
- [ ] If opus: justification — Cross-stack coordination: extends upload route (server), extends conversation service (server), creates upload hook (client), extends 3 messaging components (client), adds download route (server), handles XHR upload progress + optimistic UI + Socket.IO attachment payloads. Transaction atomicity across message + attachments requires careful implementation.

## Validation Scenarios (SN-2 — REQUIRED)

1. **Single file attachment — happy path.** User clicks attachment button, selects a PDF. File uploads with progress indicator. User types text and clicks Send. Message persists with both text content and attachment record in a single transaction. Recipient sees message with text + file download link.

2. **Multiple files — up to 3.** User selects 3 files (1 PDF, 2 images). All upload concurrently with individual progress bars. All complete successfully. User sends message. All 3 attachments appear in the message bubble.

3. **4th file rejected.** User has 3 pending files. Attempts to add a 4th. Error: "Maximum 3 files per message". The 4th file is not added.

4. **File too large.** User selects a 15MB PDF. Error: "File exceeds 10MB limit". File is not uploaded.

5. **Invalid file type.** User selects a .exe file. Error: "File type not supported". File is not uploaded.

6. **Upload failure — retry.** User selects a file. Network error during upload. File shows error state with retry button. User clicks retry. Upload succeeds. User can now send.

7. **Upload failure — remove.** User selects a file. Upload fails. User clicks remove (X button). File is removed from pending list. User can send the text-only message.

8. **Message-only — no attachments.** User types text without attaching files. Sends normally. No attachment records created. Existing behavior is preserved.

9. **Attachment-only — no text.** User attaches a file but types no text. Message is sent with empty/minimal content and the attachment. (Content validation allows empty text when attachments are present.)

10. **Read-only conversation — no attachment button.** Application is in terminal state (withdrawn/rejected/hired). Conversation is read-only. No MessageInput shown, no attachment button visible.

11. **Real-time delivery with attachments.** Employer sends message with PDF attachment. Seeker receives `message:new` via Socket.IO. The payload includes attachment metadata. Seeker sees the file download link immediately without page refresh.

12. **Download authentication.** Recipient clicks download on an attachment. Request goes through `/api/v1/upload/download/{fileUploadId}`. Server validates user is a conversation participant. Returns signed S3 URL or proxied file content.

13. **Non-participant cannot download.** User C (not in the conversation) obtains a file upload ID. Attempts to download. Server returns 404 (not 403, per 404-not-403 invariant).

14. **Image thumbnail preview.** Message contains a .jpg attachment. MessageBubble renders an inline thumbnail (small image preview). Clicking opens/downloads the full image.

15. **Upload completes but send fails.** Files upload successfully. User clicks Send. Network error on POST /api/v1/conversations/{id}/messages. Message shows "failed" status with retry button. Attachments are already uploaded — retry re-sends the message with same `attachmentFileUploadIds` (no re-upload needed).

16. **Concurrent sends with attachments.** User sends two messages in quick succession, both with attachments. Each message has its own set of attachment records. No cross-contamination.

17. **Optimistic attachment rendering.** User sends a message with attachments. The attachment UI appears immediately in the sender's message bubble (optimistic state with `_status: "sending"`), before server confirmation. After server confirms, the message transitions to `"delivered"` with server-assigned attachment IDs.

18. **Transaction rollback on attachment failure.** Files upload successfully. User sends. `createMessage` succeeds but `createMessageAttachments` throws a DB error. Neither the message nor the attachments persist (transaction rolls back). EventBus does NOT emit `portal.message.sent`. Client shows "failed" status.

## Flow Owner (SN-4)

**Owner:** Dev (full vertical — upload route extension + service + hooks + UI + download route)

## Context for Development

### Architecture: File Attachment Flow

```
User clicks attachment button → file picker opens
  ↓ (user selects files)
Client: useFileAttachment hook validates type + size
  ↓ (valid files only)
Client: XHR POST /api/v1/upload/file (with progress tracking)
  ↓ (S3 upload + platformFileUploads record)
Server: returns { fileUploadId, objectKey, publicUrl }
  ↓ (all uploads complete)
User clicks Send:
  ↓
Client: POST /api/v1/conversations/{applicationId}/messages
  Body: { content, contentType: "text", attachmentFileUploadIds: ["id1", "id2"] }
  ↓
Server: conversation-service.sendMessage() (extended)
  1. Validate content + application context (existing logic)
  2. Validate file uploads (exist, status=ready, belong to sender)
  3. db.transaction: createMessage + createMessageAttachments (atomic)
  4. Emit portal.message.sent with attachments in payload
  ↓
EventBus → eventbus-bridge → Socket.IO message:new (with attachment metadata)
  ↓
Recipient client: handleMessageNew → renders message + attachments
```

### Architecture: Download Flow

```
User clicks "Download" on attachment
  ↓
Client: GET /api/v1/upload/download/{fileUploadId}
  ↓
Server:
  1. Authenticate session
  2. Look up file upload by ID
  3. Find which message(s) reference this fileUploadId (chatMessageAttachments)
  4. Find which conversation(s) contain that message
  5. Verify user is a member of the conversation (isConversationMember)
  6. Generate signed S3 URL (GetObjectCommand + getSignedUrl)
  7. Redirect to signed URL (or proxy the content)
```

### Existing Infrastructure to Reuse (NO New Migrations)

| Component | Location | What |
|-----------|----------|------|
| `chatMessageAttachments` schema | `packages/db/src/schema/chat-message-attachments.ts` | Table with messageId FK, fileUploadId FK, denormalized fields |
| `createMessageAttachments(messageId, attachments, tx)` | `packages/db/src/queries/chat-message-attachments.ts:21` | Atomic insert with transaction support |
| `getAttachmentsForMessages(messageIds)` | `packages/db/src/queries/chat-message-attachments.ts:47` | Batch-load for N+1 prevention |
| `createFileUpload(data)` | `packages/db/src/queries/file-uploads.ts:9` | Record upload in DB |
| `getFileUploadById(id)` | `packages/db/src/queries/file-uploads.ts:39` | Validate upload exists + status |
| `getPortalS3Client()` | `apps/portal/src/lib/s3-client.ts:7` | S3 singleton (Hetzner) |
| Portal upload route | `apps/portal/src/app/api/v1/upload/file/route.ts` | Existing file upload endpoint |
| Community `useFileAttachment` hook | `apps/community/src/features/chat/hooks/use-file-attachment.ts` | Reference implementation for portal hook |
| Community `sendMessageWithAttachments` | `apps/community/src/services/message-service.ts:194` | Reference transaction pattern |

### Key Invariants

1. **Upload status MUST be `ready` before attachment.** The conversation service must validate `getFileUploadById(id).status === "ready"` for every attachment. Files still in `processing` or `pending_scan` are rejected.
2. **Uploader MUST be sender.** Each file upload's `uploaderId` must match the message sender's `userId`. This prevents using someone else's uploaded files.
3. **Max 3 files per portal message.** Portal messaging is professional (CVs, portfolio docs) — not a file dump. Community allows 10; portal is deliberately more restrictive.
4. **Atomic transaction: message + attachments.** Use `db.transaction()` to insert both the message and its `chatMessageAttachments` records. If either fails, both roll back.
5. **Download requires conversation membership.** Before serving a file, verify the requesting user is a member of the conversation that contains the message referencing the file. Use `isConversationMember(convId, userId, "portal")`.
6. **XHR for uploads, not fetch.** The upload hook must use `XMLHttpRequest` for upload progress tracking (`xhr.upload.onprogress`). This matches the community pattern. Tests must use `MockXHR` class (not `global.fetch` mocks).
7. **Denormalized attachment fields.** `chatMessageAttachments` stores `fileName`, `fileType`, `fileSize`, `fileUrl` inline — these are copies from `platformFileUploads` at insertion time. This allows fast reads without joining to the uploads table.
8. **S3 key pattern for messages: `portal/messages/{userId}/{uuid}.{ext}`** — distinct from logos (`portal/logos/...`) to enable future per-prefix lifecycle policies.

### Portal Upload Route Extension

The existing `apps/portal/src/app/api/v1/upload/file/route.ts` currently accepts only images (JPEG/PNG/WebP/GIF) at 5MB max — it was built for company logos. For message file sharing, it needs to support additional types and sizes.

**Approach: Add `category` parameter to discriminate upload context.**

```typescript
// Extended route should accept optional "category" in FormData:
// - "logo" (default, backwards-compatible): JPEG/PNG/WebP/GIF, 5MB max, key prefix: portal/logos/
// - "message": PDF/DOC/DOCX/images/TXT, 10MB max, key prefix: portal/messages/
```

**Allowed MIME types for message category:**
- `application/pdf`
- `application/msword` (`.doc`)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`)
- `image/jpeg`, `image/png`, `image/webp`
- `text/plain`

**CRITICAL**: The epics spec says 10MB max per file. The existing `UPLOAD_SIZE_LIMITS.document` in `@igbo/config/upload` is 25MB. For portal messages, enforce 10MB at the route level (not config level) to match the spec constraint without modifying the shared config.

**CRITICAL**: `.doc` and `.docx` MIME types are NOT in `@igbo/config/upload`'s `UPLOAD_ALLOWED_MIME_TYPES` (which only has `application/pdf` for documents). The portal upload route must define its own message-specific allowed MIME set rather than importing from `@igbo/config/upload`. This is acceptable — the portal route already has its own `ALLOWED_MIME_TYPES` constant for logos.

### Conversation Service Extension

Extend `SendPortalMessageParams` and `sendMessage()` in `apps/portal/src/services/conversation-service.ts`:

```typescript
export interface SendPortalMessageParams {
  // ... existing fields ...
  /** File upload IDs to attach (max 3, must be status=ready, uploaderId=sender) */
  attachmentFileUploadIds?: string[];
}
```

In `sendMessage()`, after content validation (Step 1), add attachment validation:
- If `attachmentFileUploadIds` is provided and non-empty:
  - Validate length <= 3
  - For each ID: `getFileUploadById(id)` → must exist, status=`ready`, uploaderId=senderId
  - Allow empty content when attachments present (relax the `trimmedContent.length === 0` check)
- In the transaction (Steps 6a/6b), after `createMessage()`, call `createMessageAttachments()` with denormalized fields
- Include attachments in the `portal.message.sent` EventBus payload

**CRITICAL**: In the race-condition recovery path (Step 6a catch for unique violation), the fallback `createMessage()` call also needs the attachment insert. Wrap both in their own mini-transaction.

### useFileAttachment Hook (Portal-Specific)

Create `apps/portal/src/hooks/use-file-attachment.ts` — adapted from community's hook with these portal-specific differences:

| Aspect | Community | Portal |
|--------|-----------|--------|
| Max files | 10 | 3 |
| Upload endpoint | `/api/upload/file` | `/api/v1/upload/file` |
| Category param | yes (from config) | `"message"` (hardcoded) |
| MIME validation | `UPLOAD_ALLOWED_MIME_TYPES` (global) | Portal message-specific set |
| Size limit | Per-category from config | 10MB flat |

**Key implementation notes:**
- Use XHR (not fetch) for upload progress — match community pattern exactly
- `PendingUpload` and `UploadedFileInfo` types can be copied from community
- `addFiles()` should accept files up to the remaining slot count (3 - existing count) and return an error string if any files were rejected due to the limit being reached. Pattern: accept the first N files that fit, show `maxFilesReached` error for the overflow files. This satisfies VS3 (error shown) while still accepting valid files.
- `processUpload()` does client-side MIME + size validation before uploading
- Include `clearAll()` function to reset after message send — **this is net-new; community hook does NOT have `clearAll()`**
- Include `retryUpload(tempId: string)` function to re-trigger `processUpload()` on a failed `PendingUpload` entry (VS6)

### Message Rendering — Attachment Display

Extend `MessageBubble.tsx` to render attachments:

```typescript
// New type for attachment in PortalMessage
interface MessageAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
}

// Add to PortalMessage type:
_attachments?: MessageAttachment[];
```

Rendering logic:
- If `message._attachments?.length > 0`, render attachment list below content
- Image types (`image/*`): show thumbnail preview (`<img>` with max-width constraint)
- Non-image types: show file icon + filename + size + download link
- Download link points to `/api/v1/upload/download/{attachmentId}`
- File size formatted as human-readable (KB/MB)

### Download Route

Create `apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.ts`:

```typescript
// GET /api/v1/upload/download/{fileUploadId}
// 1. Auth check
// 2. getFileUploadById → must exist
// 3. Find chatMessageAttachments where fileUploadId matches
// 4. Find chatMessages where id matches messageId
// 5. isConversationMember(conversationId, userId, "portal") → must be member
// 6. Generate signed S3 URL (GetObjectCommand + getSignedUrl from @aws-sdk/s3-request-presigner)
// 7. Return redirect to signed URL
```

**Install required**: `@aws-sdk/s3-request-presigner` — **CONFIRMED MISSING** from portal deps. Must run `pnpm --filter portal add @aws-sdk/s3-request-presigner` before this task.

**CRITICAL: 404-not-403 invariant** — non-members get 404, not 403.

### EventBus Payload Extension

The `portal.message.sent` event payload (emitted in conversation-service) needs an `attachments` field:

```typescript
portalEventBus.emit("portal.message.sent", {
  // ... existing fields ...
  attachments: attachmentPayload, // Array<{ id, fileUrl, fileName, fileType, fileSize }>
});
```

The eventbus-bridge in community (`apps/community/src/server/realtime/subscribers/eventbus-bridge.ts`) forwards this to the `/portal` Socket.IO namespace as `message:new`. The bridge should pass through the `attachments` field in the broadcast payload so recipients receive attachment metadata in real-time.

**VERIFIED**: The eventbus-bridge's `portal.message.sent` handler at line 389 **cherry-picks fields** — it does NOT spread the payload. `attachments` must be explicitly added to the cherry-pick object (Task 10.1).

### Previous Story Intelligence (P-5.3 Learnings)

- **Portal ESLint**: No `react-hooks/exhaustive-deps` rule — do NOT add eslint-disable comments for it.
- **Mock socket pattern**: Use `handlers` map + `_trigger` helper for socket event simulation in tests.
- **`vi.hoisted()` for mock event bus**: Required to avoid "cannot access before initialization" error.
- **XHR mock pattern**: Community `use-file-attachment.test.ts` uses `MockXHR` class with `instances[]`, `responseText`, `triggerLoad(status)`, `triggerError()`. Portal tests must follow the same pattern.
- **Portal namespace test pattern**: Extend existing `apps/community/src/server/realtime/namespaces/portal.test.ts` if the namespace itself changes (unlikely for this story — attachments flow through existing `message:new` broadcast).
- **`portalNsp.to()` vs `socket.to()`**: For reference only — no new socket handlers added in this story.

### DB Functions Reference

| Function | Source | Used For | Status |
|----------|--------|----------|--------|
| `createMessageAttachments(messageId, attachments, tx)` | `@igbo/db/queries/chat-message-attachments` | Insert attachment records in transaction | Existing |
| `getAttachmentsForMessages(messageIds)` | `@igbo/db/queries/chat-message-attachments` | Batch-load attachments for GET response enrichment | Existing |
| `getMessageAttachments(messageId)` | `@igbo/db/queries/chat-message-attachments` | Single-message attachment lookup (download auth) | Existing |
| `getAttachmentByFileUploadId(fileUploadId)` | `@igbo/db/queries/chat-message-attachments` | Download route: find attachment + messageId by fileUploadId | **NEW** |
| `getMessageById(messageId)` | `@igbo/db/queries/chat-messages` | Download route: find conversationId by messageId | **NEW** |
| `createFileUpload(data)` | `@igbo/db/queries/file-uploads` | Record upload in DB | Existing |
| `getFileUploadById(id)` | `@igbo/db/queries/file-uploads` | Validate upload exists, status=ready, belongs to sender | Existing |
| `createMessage(data, tx)` | `@igbo/db/queries/chat-messages` | Create message record (existing) | Existing |
| `isConversationMember(convId, userId, context)` | `@igbo/db/queries/chat-conversations` | Validate download authorization | Existing |

## Tasks / Subtasks

- [x] Task 1: Add i18n keys (AC: all) — **MUST be done first to avoid test failures from missing i18n keys**
  - [x] 1.1 In `apps/portal/messages/en.json`, add to `Portal.messages`:
    ```json
    "attachFile": "Attach file",
    "attachments": "Attachments",
    "fileUploading": "Uploading...",
    "fileUploadFailed": "Upload failed",
    "fileTooLarge": "File exceeds 10MB limit",
    "unsupportedType": "File type not supported. Accepted: PDF, Word, images, text",
    "maxFilesReached": "Maximum 3 files per message",
    "download": "Download",
    "removeFile": "Remove file",
    "retryUpload": "Retry upload"
    ```
    Add file size formatting keys:
    ```json
    "fileSizeBytes": "{size} B",
    "fileSizeKb": "{size} KB",
    "fileSizeMb": "{size} MB"
    ```
  - [x] 1.2 In `apps/portal/messages/ig.json`, add equivalent Igbo translations to `Portal.messages`:
    ```json
    "attachFile": "Tinye faịlụ",
    "attachments": "Ihe etinyere",
    "fileUploading": "Na-ebugo...",
    "fileUploadFailed": "Ibuga faịlụ adaghị",
    "fileTooLarge": "Faịlụ karịrị 10MB",
    "unsupportedType": "Ụdị faịlụ a anaghị akwado ya. A nabatara: PDF, Word, onyonyo, ederede",
    "maxFilesReached": "Faịlụ 3 kachasị n'ozi ọ bụla",
    "download": "Budata",
    "removeFile": "Wepụ faịlụ",
    "retryUpload": "Nwaa ọzọ",
    "fileSizeBytes": "{size} B",
    "fileSizeKb": "{size} KB",
    "fileSizeMb": "{size} MB"
    ```

- [x] Task 2: Extend portal upload route for message files (AC: #1, #2)
  - [x] 2.1 In `apps/portal/src/app/api/v1/upload/file/route.ts`:
    - Add `category` FormData field: `"logo"` (default) or `"message"`
    - For `"message"` category:
      - Allowed MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/jpeg`, `image/png`, `image/webp`, `text/plain`
      - Max size: 10MB (10 * 1024 * 1024)
      - S3 key prefix: `portal/messages/{userId}/{uuid}.{ext}`
    - For `"logo"` category (backwards-compatible): keep existing behavior exactly
    - Set `status: "ready"` on the `createFileUpload()` call (portal has no async processing pipeline — files are immediately usable). **NOTE**: Current route already omits `status`, which defaults to... check what `platformFileUploads.status` defaults to in schema. If it defaults to `processing`, the service will reject the attachment. Must explicitly set `status: "ready"`.
  - [x] 2.2 Write tests: `apps/portal/src/app/api/v1/upload/file/route.test.ts` (new or extend existing):
    - Test: message category accepts PDF, returns fileUploadId
    - Test: message category accepts .docx, returns fileUploadId
    - Test: message category accepts image (jpeg), returns fileUploadId
    - Test: message category accepts .txt, returns fileUploadId
    - Test: message category rejects .exe (unsupported type)
    - Test: message category rejects file > 10MB
    - Test: logo category still works (backwards-compatible)
    - Test: missing category defaults to logo behavior
    - Test: unauthenticated request returns 401
    - Test: S3 key uses `portal/messages/` prefix for message category
    - Test: message category upload creates record with `status: "ready"` (CRITICAL — schema default is `"processing"`, service rejects non-ready uploads)
    - Test: S3 PutObjectCommand includes `ContentDisposition: "attachment"` for non-image message files

- [x] Task 3: Extend conversation service for attachments (AC: #3, #8)
  - [x] 3.1 In `apps/portal/src/services/conversation-service.ts`:
    - Add `attachmentFileUploadIds?: string[]` to `SendPortalMessageParams`
    - Add attachment validation before transaction:
      - Max 3 attachments
      - Each upload: exists, status=`ready`, uploaderId=senderId
      - Allow empty text content when attachments present (`trimmedContent.length === 0` OK if attachments provided)
    - In transaction blocks (both Step 6a and 6b):
      - After `createMessage()`, call `createMessageAttachments(msg.id, attachmentValues, tx)`
      - Denormalize fields: `{ fileUploadId, fileUrl: upload.processedUrl ?? buildS3PublicUrl(upload.objectKey), fileName: upload.originalFilename, fileType: upload.fileType, fileSize: upload.fileSize }`
      - **NOTE**: `processedUrl` is always `null` for portal uploads (no async processing pipeline). `buildS3PublicUrl(objectKey)` is a new helper — construct as `${HETZNER_S3_PUBLIC_URL}/${objectKey}` (pattern at `apps/portal/src/app/api/v1/upload/file/route.ts:73-75`). This URL is used for image thumbnail `<img src>` rendering. The download link uses `/api/v1/upload/download/{id}` instead (signed URL).
    - In race-condition recovery path (6a catch): wrap fallback `createMessage()` + `createMessageAttachments()` in their own `db.transaction()`
    - Add `attachments` to EventBus `portal.message.sent` payload
    - Return attachments in `SendPortalMessageResult`
  - [x] 3.2 Extend `getPortalConversationMessages()`:
    - After fetching messages, call `getAttachmentsForMessages(messageIds)` to batch-load attachments
    - Group attachments by messageId and attach as `_attachments` on each message
    - Return enriched messages
  - [x] 3.3 Write tests: extend `apps/portal/src/services/conversation-service.test.ts`:
    - Test: sendMessage with valid attachments — message + attachments created atomically
    - Test: sendMessage with invalid upload ID — 400 error
    - Test: sendMessage with upload not owned by sender — 400 error
    - Test: sendMessage with upload not in "ready" status — 400 error
    - Test: sendMessage with > 3 attachments — 400 error
    - Test: sendMessage with 0 attachments — existing behavior preserved
    - Test: sendMessage with empty text but valid attachments — succeeds
    - Test: EventBus payload includes attachments array
    - Test: createMessageAttachments fails → sendMessage rejects, EventBus not emitted (VS18 — transaction rollback)
    - Test: race-condition recovery: fallback createMessage + createMessageAttachments both succeed with attachments
    - Test: empty content + no attachments → still rejected (degenerate case)
    - Test: getPortalConversationMessages returns messages with _attachments populated

- [x] Task 4: Extend API route for attachments (AC: #3)
  - [x] 4.1 In `apps/portal/src/app/api/v1/conversations/[applicationId]/messages/route.ts`:
    - Extend `sendMessageSchema` with `attachmentFileUploadIds`:
      ```typescript
      const sendMessageSchema = z.object({
        content: z.string().max(5000).optional().default(""),
        contentType: z.enum(["text"]).optional().default("text"),
        parentMessageId: z.string().uuid().nullable().optional(),
        attachmentFileUploadIds: z.array(z.string().uuid()).max(3).optional(),
      });
      ```
    - Validate: either content (trimmed) is non-empty OR attachmentFileUploadIds is non-empty
    - Pass `attachmentFileUploadIds` to `conversationService.sendMessage()`
    - GET response already uses `conversationService.getPortalConversationMessages()` — attachments come from service enrichment (Task 3.2)
  - [x] 4.2 Write tests: extend `apps/portal/src/app/api/v1/conversations/[applicationId]/messages/route.test.ts`:
    - Test: POST with attachmentFileUploadIds passes them to service
    - Test: POST with empty content + attachments succeeds
    - Test: POST with empty content + no attachments fails validation
    - Test: POST with > 3 attachmentFileUploadIds fails schema validation
    - Test: GET returns messages with _attachments populated

- [x] Task 5: Create download route + new DB queries (AC: #5)
  - [x] 5.0 Add two new DB query functions (**required for download route**):
    - In `packages/db/src/queries/chat-message-attachments.ts`, add:
      ```typescript
      /** Find attachment record by fileUploadId (for download authorization). Returns first match or null. */
      export async function getAttachmentByFileUploadId(fileUploadId: string) {
        const [attachment] = await db.select().from(chatMessageAttachments)
          .where(eq(chatMessageAttachments.fileUploadId, fileUploadId)).limit(1);
        return attachment ?? null;
      }
      ```
    - In `packages/db/src/queries/chat-messages.ts`, add:
      ```typescript
      /** Get a single message by ID (for download route conversationId lookup). */
      export async function getMessageById(messageId: string) {
        const [message] = await db.select().from(chatMessages)
          .where(eq(chatMessages.id, messageId)).limit(1);
        return message ?? null;
      }
      ```
    - Write tests for both in their respective test files
    - Run `pnpm --filter @igbo/db build` after adding (portal TS resolves from dist/)
  - [x] 5.1 Create `apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.ts` (**new file**):
    - **FIRST**: Run `pnpm --filter portal add @aws-sdk/s3-request-presigner` (not in portal's package.json)
    - Auth check: `await auth()` → 401 if not authenticated
    - Validate `fileUploadId` UUID format
    - `getFileUploadById(fileUploadId)` → 404 if not found
    - `getAttachmentByFileUploadId(fileUploadId)` → 404 if not found (uses new query from 5.0)
    - `getMessageById(attachment.messageId)` → 404 if not found (uses new query from 5.0)
    - `isConversationMember(conversationId, userId, "portal")` → 404 if not member (404-not-403)
    - Generate signed S3 URL using `@aws-sdk/s3-request-presigner`:
      ```typescript
      import { GetObjectCommand } from "@aws-sdk/client-s3";
      import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
      const command = new GetObjectCommand({ Bucket: process.env.HETZNER_S3_BUCKET, Key: upload.objectKey });
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min
      ```
    - Return redirect: `Response.redirect(signedUrl, 302)`
    - **Check dependency**: `@aws-sdk/s3-request-presigner` — if not in `apps/portal/package.json`, add it
  - [x] 5.2 Write tests: `apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.test.ts` (**new file**):
    - Test: authenticated member gets 302 redirect to signed URL
    - Test: unauthenticated returns 401
    - Test: invalid fileUploadId format returns 400
    - Test: non-existent file returns 404
    - Test: file not linked to any message returns 404
    - Test: non-member of conversation returns 404 (not 403)
    - Test: signed URL has correct S3 key and expiration (`getSignedUrl` called with `{ expiresIn: 300 }`)
    - Test: getSignedUrl throws (S3 client error) → returns 500

- [x] Task 6: Create portal useFileAttachment hook (AC: #1, #6)
  - [x] 6.1 Create `apps/portal/src/hooks/use-file-attachment.ts` (**new file**):
    - Adapt from community `apps/community/src/features/chat/hooks/use-file-attachment.ts`
    - Portal-specific constants:
      - `MAX_ATTACHMENTS = 3`
      - `MAX_FILE_SIZE = 10 * 1024 * 1024` (10MB)
      - `MESSAGE_ALLOWED_MIME_TYPES` — same set as upload route message category
    - Upload endpoint: `/api/v1/upload/file` (same as current, with `category: "message"` in FormData)
    - Use XHR for progress tracking (same pattern as community)
    - Exports: `pendingUploads`, `isUploading`, `addFiles`, `removeFile`, `clearAll`
    - `clearAll()`: resets pendingUploads to empty array — called after successful message send
    - Types: `PendingUpload`, `UploadedFileInfo` — same as community
  - [x] 6.2 Create `apps/portal/src/hooks/use-file-attachment.test.ts` (**new file**):
    - **CRITICAL**: Use `MockXHR` class pattern from community — NOT `global.fetch` mocks
    - Test: addFiles with valid files creates PendingUpload entries
    - Test: addFiles rejects files exceeding MAX_ATTACHMENTS
    - Test: processUpload rejects unsupported MIME type
    - Test: processUpload rejects file exceeding MAX_FILE_SIZE
    - Test: successful upload transitions status to "done" with fileUploadId
    - Test: upload failure transitions status to "error"
    - Test: removeFile removes specific pending upload
    - Test: clearAll resets all pending uploads
    - Test: isUploading is true while any upload is in progress
    - Test: XHR upload progress updates pendingUpload.progress (trigger via `xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent)`)
    - Test: retryUpload re-triggers processUpload on failed PendingUpload (VS6)
    - Test: concurrent uploads — 3 files added simultaneously, MockXHR.instances.length === 3, each triggered independently
    - Test: isUploading true when 1 of 2 uploads done but 1 still uploading (partial completion)

- [x] Task 7: Update MessageInput with attachment UI (AC: #1, #6, #7)
  - [x] 7.1 In `apps/portal/src/components/messaging/MessageInput.tsx`:
    - Add `onAddFiles?: (files: File[]) => void` prop
    - Add `pendingUploads?: PendingUpload[]` prop
    - Add `onRemoveFile?: (tempId: string) => void` prop
    - Add `isUploading?: boolean` prop
    - Add attachment button (paperclip icon) next to send button
    - Add hidden `<input type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt">` triggered by button
    - Render pending upload list above the textarea showing filename, progress/status, remove button
    - Disable send button while `isUploading` is true
    - The `disabled` prop already hides the entire input for read-only conversations — attachment button inherits this behavior
  - [x] 7.2 Write tests: extend `apps/portal/src/components/messaging/MessageInput.test.tsx`:
    - Test: attachment button renders with aria-label
    - Test: clicking attachment button triggers file input
    - Test: pending uploads list renders filenames and progress
    - Test: remove button calls onRemoveFile
    - Test: send button disabled while isUploading is true
    - Test: attachment button hidden when disabled prop is true (read-only)

- [x] Task 8: Update MessageBubble with attachment rendering (AC: #4, #14)
  - [x] 8.1 In `apps/portal/src/components/messaging/MessageBubble.tsx`:
    - Accept `attachments?: MessageAttachment[]` prop (or read from message._attachments)
    - If attachments present, render attachment list below content:
      - Image types (`image/jpeg`, `image/png`, `image/webp`): `<img>` thumbnail with max-width, clickable → download link
      - Non-image types: file icon + filename + human-readable size + download link
    - Download links: `<a href="/api/v1/upload/download/{attachmentId}">` with `aria-label` including filename
    - File size formatter: `formatFileSize(bytes)` — helper function (inline or extracted to `@/lib/format-file-size.ts`)
  - [x] 8.2 Write tests: extend `apps/portal/src/components/messaging/MessageBubble.test.tsx`:
    - Test: message with no attachments renders normally (existing behavior)
    - Test: message with PDF attachment renders filename, size, download link
    - Test: message with image attachment renders thumbnail img
    - Test: download link href points to /api/v1/upload/download/{id}
    - Test: download link has aria-label with filename
    - Test: multiple attachments render as list
    - Test: file size displayed in human-readable format (e.g., "2.5 MB")
    - Test: image thumbnail has `alt` attribute (axe `image-alt` rule)
    - Test: formatFileSize edge cases — null → "0 B", 0 → "0 B", 1023 → "1023 B", 1024 → "1.0 KB", 1048576 → "1.0 MB"
    - Test: message with `_attachments: []` (empty array) does NOT render attachment list

- [x] Task 9: Wire everything in ConversationThread (AC: all)
  - [x] 9.1 In `apps/portal/src/components/messaging/ConversationThread.tsx`:
    - Import and use `useFileAttachment` hook
    - Pass `pendingUploads`, `onAddFiles`, `onRemoveFile`, `isUploading` to `MessageInput`
    - Extend `sendMessage` to include `attachmentFileUploadIds` from completed uploads:
      ```typescript
      const completedUploads = pendingUploads.filter(u => u.status === "done") as UploadedFileInfo[];
      const fileUploadIds = completedUploads.map(u => u.fileUploadId);
      await sendMessage(content, fileUploadIds); // extended signature
      clearAll(); // reset after successful send
      ```
    - Pass `_attachments` to `MessageBubble` from each `PortalMessage`
  - [x] 9.2 Extend `usePortalMessages.sendMessage()` in `apps/portal/src/hooks/use-portal-messages.ts`:
    - Change signature: `sendMessage: (content: string, attachmentFileUploadIds?: string[]) => Promise<void>`
    - Include `attachmentFileUploadIds` in POST body
    - Allow empty content when `attachmentFileUploadIds` is non-empty
    - Add `_attachments` to optimistic message (from pending uploads metadata)
  - [x] 9.2b Extend `retryMessage()` in `apps/portal/src/hooks/use-portal-messages.ts`:
    - **CRITICAL**: Current `retryMessage()` (line ~274) hardcodes POST body as `{ content: msg.content, contentType: "text" }` — it does NOT include attachment IDs. After this story, retry of a message-with-attachments would lose its attachments.
    - Store `_attachmentFileUploadIds` on the optimistic `PortalMessage` when sending with attachments
    - In `retryMessage()`, include `attachmentFileUploadIds: msg._attachmentFileUploadIds` in the POST body
    - This ensures VS15 (send fails, retry preserves attachments) works correctly
  - [x] 9.3 Extend `PortalMessage` type in `use-portal-messages.ts`:
    - Add `_attachments?: MessageAttachment[]` field
  - [x] 9.4 Handle `message:new` with attachments in `use-portal-messages.ts`:
    - The `handleMessageNew` handler spreads the entire payload: `{ ...msg, _status: "delivered" }`. The bridge emits `attachments` (no underscore prefix) but the `PortalMessage` type uses `_attachments` (underscore prefix). **Explicitly map** `attachments` → `_attachments` in `handleMessageNew`: `{ ...msg, _status: "delivered", _attachments: msg.attachments ?? [] }`. Do NOT rely on spread passthrough — the field names differ.
  - [x] 9.5 Write tests: extend `apps/portal/src/components/messaging/ConversationThread.test.tsx`:
    - Test: file attachment hook is wired — attachment button visible
    - Test: sending message with attachments includes fileUploadIds in API call
    - Test: pendingUploads are cleared after successful send
    - Test: messages with _attachments render attachment UI in MessageBubble
  - [x] 9.6 Write tests: extend `apps/portal/src/hooks/use-portal-messages.test.ts`:
    - Test: sendMessage with attachmentFileUploadIds includes them in POST body
    - Test: sendMessage with empty content + attachments succeeds
    - Test: sendMessage creates optimistic message with _attachments populated (VS17)
    - Test: retryMessage with attachment IDs re-sends attachmentFileUploadIds in POST body (VS15)
    - Test: message:new event with attachments maps to _attachments in messages state (field name mapping)
    - Test: message:new event without attachments → _attachments is empty array (text-only message via socket)

- [x] Task 10: Verify EventBus bridge forwards attachments (AC: #8)
  - [x] 10.1 In `apps/community/src/server/realtime/subscribers/eventbus-bridge.ts`:
    - **CONFIRMED**: The `portal.message.sent` handler at line 389 cherry-picks fields for `message:new` — it does NOT spread the payload. `attachments` is currently omitted.
    - Add `attachments: portalMsgPayload.attachments ?? []` to the `message:new` emit object (after line 398, `senderRole`)
    - Update `PortalMessageSentEvent` in `packages/config/src/events.ts:177` to include:
      ```typescript
      attachments?: Array<{ id: string; fileUrl: string; fileName: string; fileType: string | null; fileSize: number | null }>;
      ```
  - [x] 10.2 Write test (**unconditional** — bridge modification is confirmed required): extend `apps/community/src/server/realtime/subscribers/eventbus-bridge.test.ts`:
    - Test: `portal.message.sent` with attachments → `message:new` broadcast includes attachments
    - Test: `portal.message.sent` without attachments → `message:new` broadcast includes `attachments: []` (backwards-compatible)

- [x] Task 11: Verify all tests pass
  - [x] 11.1 `pnpm --filter portal test` — all pass
  - [x] 11.2 `pnpm --filter community test` — no regressions
  - [x] 11.3 `pnpm --filter @igbo/db test` — no regressions (no DB changes in this story)
  - [x] 11.4 `pnpm turbo typecheck` — all packages pass

## Dev Notes / Gotchas

### Critical: XHR for Upload Progress

The `useFileAttachment` hook MUST use `XMLHttpRequest` (not `fetch`) for file uploads. This is required for `xhr.upload.onprogress` which provides upload progress percentage. `fetch()` does not support upload progress tracking.

In tests, use a `MockXHR` class:
```typescript
class MockXHR {
  static instances: MockXHR[] = [];
  status = 0;
  responseText = "";
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open = vi.fn();
  send = vi.fn();
  constructor() { MockXHR.instances.push(this); }
  triggerLoad(status: number) { this.status = status; this.onload?.(); }
  triggerError() { this.onerror?.(); }
}
global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;
```

### Critical: Upload Status Default (CONFIRMED)

**CONFIRMED**: `platformFileUploads.status` defaults to `"processing"` at `packages/db/src/schema/file-uploads.ts:17`. The portal upload route currently omits `status` in `createFileUpload()`, so every existing portal upload (logos) has `status="processing"`. For message-category uploads, the route **MUST** explicitly set `status: "ready"` — the conversation service validates this before allowing attachment. See "Critical: `status: "ready"`" gotcha above for details.

### Critical: Content Validation Relaxation

Current `sendMessage()` rejects `trimmedContent.length === 0`. This must be relaxed when `attachmentFileUploadIds` is non-empty. The rule becomes: **either content is non-empty OR attachments are non-empty** (or both). A message with no content and no attachments is still rejected.

### Critical: Transaction in Race-Condition Path

The race-condition recovery path in `sendMessage()` (Step 6a catch for unique violation error code 23505) currently calls `createMessage()` outside a transaction. With attachments, both message and attachment inserts need to be atomic. Wrap the recovery path in `db.transaction()`.

### Critical: `@aws-sdk/s3-request-presigner` Dependency (CONFIRMED MISSING)

**CONFIRMED**: `@aws-sdk/s3-request-presigner` is NOT in `apps/portal/package.json`. Only `@aws-sdk/client-s3` is present. Must install before implementing download route:
```bash
pnpm --filter portal add @aws-sdk/s3-request-presigner
```

### File Type Icons

For the MVP, use plain text labels for file types (NOT emoji — see gotcha above):
- PDF: "PDF" label
- Word: "DOC" label
- Image: thumbnail (actual image preview with `alt` attribute)
- Text: "TXT" label

Do not import an icon library for this. Keep it simple.

### `formatFileSize()` Helper

```typescript
function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

This can be inline in MessageBubble or extracted to `@/lib/format-file-size.ts`.

### EventBus Bridge — Attachment Passthrough (CONFIRMED)

**CONFIRMED**: The eventbus-bridge handler at `eventbus-bridge.ts:389-399` **cherry-picks fields** — it does NOT spread the payload. `attachments` is currently omitted. Task 10.1 adds it. If this is missed, the sender sees attachments but the recipient only sees them after page refresh — a silent real-time failure.

### Portal ESLint Gaps

Portal `eslint.config.mjs` does NOT include `eslint-plugin-react-hooks` or `@next/eslint-plugin-next`. Do NOT add `// eslint-disable-next-line react-hooks/exhaustive-deps` or `@next/next/no-img-element` comments.

### Critical: `retryMessage()` Must Include Attachment IDs

Current `retryMessage()` in `use-portal-messages.ts` (line ~274) hardcodes POST body as `{ content: msg.content, contentType: "text" }`. It does NOT include `attachmentFileUploadIds`. If a message-with-attachments fails and the user retries, the attachments will be silently lost. Store `_attachmentFileUploadIds` on the optimistic `PortalMessage` and include them in the retry POST body.

### Critical: `attachments` → `_attachments` Field Name Mapping

The eventbus-bridge emits `attachments` (no underscore) in the `message:new` Socket.IO payload. The `PortalMessage` type uses `_attachments` (with underscore prefix). The `handleMessageNew` handler must **explicitly map** `msg.attachments` → `_attachments` — do NOT rely on the spread `{ ...msg }` preserving the correct field name, because the field names differ.

### Critical: `processedUrl` is Always Null for Portal Uploads

Portal uploads never set `processedUrl` (no async processing pipeline). It defaults to `null` in the `platformFileUploads` schema. For the `fileUrl` denormalization in `chatMessageAttachments`, use `buildS3PublicUrl(upload.objectKey)` — a new helper that constructs `${HETZNER_S3_PUBLIC_URL}/${objectKey}` (pattern at `route.ts:73-75`). This URL is used for image thumbnail `<img src>` rendering. If `fileUrl` is empty/null, thumbnails break silently.

### Critical: `status: "ready"` — Confirmed Schema Default is "processing"

Verified: `platformFileUploads.status` defaults to `"processing"` at `packages/db/src/schema/file-uploads.ts:17`. The `createFileUpload()` function signature does NOT include a `status` parameter — dev must pass `status: "ready"` directly in the `.values()` spread when calling the Drizzle insert for message-category uploads. Without this, EVERY attachment send will fail at the service validation step (`status !== "ready"`) with zero user-visible indication of why.

### Critical: S3 ContentDisposition for Non-Image Files

Set `ContentDisposition: "attachment"` on S3 `PutObjectCommand` for non-image message files (PDF, DOC, DOCX, TXT). Without this, S3 may serve PDFs inline in the browser via the signed URL redirect, which is a security concern if MIME validation is ever loosened. Image files can use `ContentDisposition: "inline"` for thumbnail rendering.

### File Type Indicators — Use Plain Text Labels, Not Emoji

Use plain text labels ("PDF", "DOC", "TXT") rather than emoji (📄, 📝) for file type indicators. Emoji rendering is inconsistent cross-platform and has unreliable screen reader announcements. Do not import an icon library.

### `db.transaction` Mock Pattern

When mocking `db.transaction` in tests, type the callback parameter as `any`:
```typescript
vi.mocked(db.transaction).mockImplementation(async (cb: any) => cb(mockTx));
```

### Files to Create

| File | Purpose |
|------|---------|
| `apps/portal/src/hooks/use-file-attachment.ts` | File upload hook (XHR + progress) |
| `apps/portal/src/hooks/use-file-attachment.test.ts` | Hook tests |
| `apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.ts` | Authenticated download route |
| `apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.test.ts` | Download route tests |
| `apps/portal/src/lib/build-s3-public-url.ts` | Helper: `buildS3PublicUrl(objectKey)` → `${HETZNER_S3_PUBLIC_URL}/${objectKey}` (used for fileUrl denormalization since portal uploads never set processedUrl) |

### Files to Modify

| File | Change |
|------|--------|
| `apps/portal/src/app/api/v1/upload/file/route.ts` | Add "message" category with extended MIME types + 10MB limit |
| `apps/portal/src/services/conversation-service.ts` | Add attachmentFileUploadIds param, attachment validation, transaction attachment insert, EventBus payload |
| `apps/portal/src/app/api/v1/conversations/[applicationId]/messages/route.ts` | Extend POST schema, relax content validation, pass attachments to service |
| `apps/portal/src/hooks/use-portal-messages.ts` | Add _attachments to PortalMessage, extend sendMessage signature, handle attachments in message:new |
| `apps/portal/src/components/messaging/MessageInput.tsx` | Add attachment button, file input, pending uploads display |
| `apps/portal/src/components/messaging/MessageBubble.tsx` | Render attachment list (images, documents, download links) |
| `apps/portal/src/components/messaging/ConversationThread.tsx` | Wire useFileAttachment, pass props to MessageInput/MessageBubble |
| `apps/portal/messages/en.json` | Add ~12 Portal.messages.* keys |
| `apps/portal/messages/ig.json` | Add ~12 Portal.messages.* keys (Igbo) |
| `apps/community/src/server/realtime/subscribers/eventbus-bridge.ts` | Add `attachments` to portal.message.sent → message:new cherry-pick (confirmed required) |
| `packages/config/src/events.ts` | Add optional `attachments` field to `PortalMessageSentEvent` type |
| `packages/db/src/queries/chat-message-attachments.ts` | Add `getAttachmentByFileUploadId()` (new query for download route) |
| `packages/db/src/queries/chat-messages.ts` | Add `getMessageById()` (new query for download route) |

### Files NOT to Touch

- `packages/db/src/migrations/*` — No new migration needed (chatMessageAttachments already exists)
- `packages/db/src/schema/*` — No schema changes
- `packages/config/src/upload.ts` — No config changes (portal route defines its own message constraints)
- `apps/community/src/server/realtime/namespaces/portal.ts` — No namespace handler changes
- `apps/portal/src/providers/SocketProvider.tsx` — No provider changes

**NOTE**: `packages/db/src/queries/*` **IS touched** — two new query functions are needed for the download route (see Task 5 and DB Functions Reference below).

### References

- [Source: packages/db/src/schema/chat-message-attachments.ts — attachment schema]
- [Source: packages/db/src/queries/chat-message-attachments.ts:21 — createMessageAttachments with tx support]
- [Source: packages/db/src/queries/chat-message-attachments.ts:47 — getAttachmentsForMessages batch loader]
- [Source: packages/db/src/queries/file-uploads.ts:9 — createFileUpload]
- [Source: packages/db/src/queries/file-uploads.ts:39 — getFileUploadById]
- [Source: apps/portal/src/app/api/v1/upload/file/route.ts — existing upload route to extend]
- [Source: apps/portal/src/lib/s3-client.ts:7 — S3 singleton]
- [Source: apps/portal/src/services/conversation-service.ts:118 — sendMessage to extend]
- [Source: apps/portal/src/hooks/use-portal-messages.ts:9 — PortalMessage type to extend]
- [Source: apps/community/src/features/chat/hooks/use-file-attachment.ts — reference hook implementation]
- [Source: apps/community/src/services/message-service.ts:194 — sendMessageWithAttachments transaction pattern]
- [Source: packages/config/src/upload.ts — upload config constants]
- [Source: _bmad-output/planning-artifacts/epics.md:1982-2018 — Story 5.4 BDD acceptance criteria]
- [Source: _bmad-output/implementation-artifacts/p-5-3-read-receipts-typing-indicators.md — previous story learnings]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without significant blockers.

### Completion Notes List

1. **`vi.hoisted()` for `mockGetSignedUrl`**: In `download/[fileUploadId]/route.test.ts`, `const mockGetSignedUrl = vi.fn()` must use `vi.hoisted()` to be referenced inside the `vi.mock()` factory (hoisting issue).
2. **`retryUpload` deadlock fix**: `retryUpload` internally `await processUpload(...)` which awaits the XHR. Using `await act(async () => { await retryUpload() })` deadlocks since the XHR trigger is outside act. Fixed with fire-and-forget: `act(() => { void retryUpload(tempId); })` then `await waitFor(...)`.
3. **`waitFor` required for XHR assertions**: After `act(() => { xhr.triggerLoad(200) })`, state updates are microtasks not flushed by synchronous `act`. All post-XHR assertions use `await waitFor(...)`.
4. **Transaction mock no inner mock overrides**: `mockDb.transaction.mockImplementation` must NOT internally re-set `createMessage.mockResolvedValue` — doing so overrides test-specific mocks set in individual tests.
5. **`makeFileUploadRecord` type fix**: Changed `Partial<ReturnType<typeof vi.fn>>` (incorrectly refers to Mock type) to inline object type with proper fields.
6. **`status: "ready"` on upload**: Portal has no async processing pipeline so message-category uploads must explicitly set `status: "ready"` in `createFileUpload()` — the schema default is `"processing"`.
7. **`attachments` → `_attachments` field mapping**: EventBus bridge emits `attachments` (no underscore); `PortalMessage` uses `_attachments`. Explicitly mapped in `handleMessageNew`.
8. **Community `use-file-attachment` differences**: Portal version adds `clearAll()` (net-new) and `retryUpload()`, uses `MAX_ATTACHMENTS = 3` (vs 10) and `MAX_FILE_SIZE = 10MB`, endpoint `/api/v1/upload/file`.

### File List

**New files created:**
- `apps/portal/src/hooks/use-file-attachment.ts`
- `apps/portal/src/hooks/use-file-attachment.test.ts`
- `apps/portal/src/lib/build-s3-public-url.ts`
- `apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.ts`
- `apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.test.ts`

**Modified files:**
- `apps/portal/messages/en.json` — added 13 Portal.messages.* i18n keys
- `apps/portal/messages/ig.json` — added 13 Portal.messages.* i18n keys (Igbo)
- `apps/portal/src/app/api/v1/upload/file/route.ts` — added "message" category (PDF/DOC/DOCX/images/TXT, 10MB, portal/messages/ prefix)
- `apps/portal/src/app/api/v1/upload/file/route.test.ts` — extended with message-category tests; fixed `makeFileUploadRecord` type
- `apps/portal/src/services/conversation-service.ts` — added attachment validation, transaction wrapping, EventBus payload, getPortalConversationMessages enrichment
- `apps/portal/src/services/conversation-service.test.ts` — extended with attachment tests, fixed transaction mock
- `apps/portal/src/app/api/v1/conversations/[applicationId]/messages/route.ts` — extended schema with `attachmentFileUploadIds`, content-or-attachments validation
- `apps/portal/src/app/api/v1/conversations/[applicationId]/messages/route.test.ts` — extended with attachment route tests
- `apps/portal/src/hooks/use-portal-messages.ts` — added `_attachments`/`_attachmentFileUploadIds` to PortalMessage, extended sendMessage/retryMessage signatures, mapped socket `attachments` → `_attachments`
- `apps/portal/src/hooks/use-portal-messages.test.ts` — extended with attachment mapping/retry tests
- `apps/portal/src/components/messaging/MessageInput.tsx` — added attachment button, hidden file input, pending uploads list
- `apps/portal/src/components/messaging/MessageInput.test.tsx` — extended with attachment UI tests
- `apps/portal/src/components/messaging/MessageBubble.tsx` — added attachment list rendering (images, documents, download links, formatFileSize)
- `apps/portal/src/components/messaging/MessageBubble.test.tsx` — extended with attachment rendering tests
- `apps/portal/src/components/messaging/ConversationThread.tsx` — wired useFileAttachment, passed props to MessageInput/MessageBubble
- `apps/portal/src/components/messaging/ConversationThread.test.tsx` — extended with file attachment tests
- `packages/config/src/events.ts` — added optional `attachments` field to `PortalMessageSentEvent`
- `packages/db/src/queries/chat-message-attachments.ts` — added `getAttachmentByFileUploadId()`
- `packages/db/src/queries/chat-message-attachments.test.ts` — added tests for `getAttachmentByFileUploadId`
- `packages/db/src/queries/chat-messages.ts` — added `getMessageById()`
- `packages/db/src/queries/chat-messages.test.ts` — added tests for `getMessageById`
- `apps/community/src/server/realtime/subscribers/eventbus-bridge.ts` — added `attachments` to portal.message.sent → message:new cherry-pick
- `apps/community/src/server/realtime/subscribers/eventbus-bridge.test.ts` — extended with attachment passthrough tests

**Dependency added:**
- `apps/portal/package.json` — `@aws-sdk/s3-request-presigner` (for signed S3 URLs in download route)

### Review Findings

- [x] [Review][Patch] F2: Rename misleading `keyPrefix` variable to `objectKey` directly [apps/portal/src/app/api/v1/upload/file/route.ts:~87]
- [x] [Review][Dismiss] F4: `clearAll()` is correctly positioned inside `try` after `await sendMessage()` — NOT in `finally`. On send failure, uploads are preserved. Verified correct.
- [x] [Review][Patch] F7: No category allowlist — arbitrary `category` values (e.g. `category=foo`) silently fall through to logo validation. Add explicit check: `if (category !== "message" && category !== "logo")` → 400 [apps/portal/src/app/api/v1/upload/file/route.ts:~44]
- [x] [Review][Patch] F9: Download route does not check `upload.status` — quarantined or deleted files can still be downloaded via signed URL. Add: `if (upload.status === "quarantined" || upload.status === "deleted") throw 404` [apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.ts:~33]
- [x] [Review][Patch] F10: Missing test — spec VS says "getSignedUrl throws (S3 client error) → returns 500" but no such test exists [apps/portal/src/app/api/v1/upload/download/[fileUploadId]/route.test.ts]
- [x] [Review][Defer] F1: MIME type validated by client-supplied `file.type` only — no magic-byte/content sniffing validation — deferred, platform-wide concern not specific to P-5.4
- [x] [Review][Defer] F3: Same fileUploadId reusable across unlimited messages — no "consumed" guard — deferred, acceptable for MVP (file remains valid regardless of how many messages reference it)
- [x] [Review][Defer] F5: TOCTOU between `validateAndBuildAttachmentValues` and transaction — file upload status could change between validation and insert — deferred, low probability and low impact
- [x] [Review][Defer] F8: XHR not aborted on component unmount in `useFileAttachment` — potential memory leak — deferred, matches community hook pattern
- [x] [Review][Defer] F11: `formatFileSize` uses hardcoded strings instead of i18n keys (`fileSizeBytes`, `fileSizeKb`, `fileSizeMb`) — deferred, i18n keys defined but not wired (cosmetic)
