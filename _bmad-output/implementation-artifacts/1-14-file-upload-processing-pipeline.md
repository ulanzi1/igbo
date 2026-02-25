# Story 1.14: File Upload Processing Pipeline

Status: done

## Story

As a developer,
I want a centralized file upload processing pipeline with virus scanning, type validation, and size enforcement,
so that all file uploads across the platform are secure, validated, and processed consistently (NFR-S8).

## Acceptance Criteria

1. **Given** any feature requires file upload (profile photos, chat attachments, post media, article images, group banners, governance documents)
   **When** the client requests a presigned upload URL from `POST /api/upload/presign`
   **Then** the API validates the file metadata (type against whitelist, size against limits) before generating the presigned URL
   **And** allowed file types are: images (JPEG, PNG, WebP, GIF, AVIF), videos (MP4, WebM), documents (PDF), and the whitelist is defined as a configuration constant at `src/config/upload.ts`
   **And** size limits are enforced per category: images max 10MB, videos max 100MB, documents max 25MB, profile photos max 5MB
   **And** the presigned URL includes a content-length condition matching the declared size to prevent bait-and-switch uploads

2. **Given** a file is uploaded directly to Hetzner Object Storage via presigned URL
   **When** the client notifies the API of upload completion (`POST /api/upload/confirm` with the object key)
   **Then** the API enqueues a file processing job (`src/server/jobs/file-processing.ts`)
   **And** the file record is created in the `platform_file_uploads` table with status `processing`
   **And** the file is NOT yet accessible to other users — the `processed_url` is null until processing completes

3. **Given** the file processing job runs
   **When** the job fetches the file from object storage
   **Then** the job ALWAYS performs magic byte verification via the `file-type` npm package (not just extension), rejecting files whose detected type doesn't match the declared MIME type or isn't on the allowed list — this check runs regardless of whether ClamAV is enabled
   **And** if `ENABLE_CLAMAV=true`, the job ALSO streams the file buffer to the ClamAV `clamd` daemon via TCP (ClamAV scan runs BEFORE magic byte check)
   **And** if all checks pass AND the file is an image, `sharp` performs WebP/AVIF conversion and generates srcset variants at 400/800/1200px widths (per NFR-P12)
   **And** the file record status updates to `ready` and `processed_url` is set to the Hetzner public CDN URL
   **And** a `file.processed` EventBus event is emitted
   **And** if magic byte validation fails, the file is deleted from object storage, the record status updates to `quarantined`, and a `file.quarantined` EventBus event is emitted

4. **Given** `ENABLE_CLAMAV=true` is set in the environment
   **When** the ClamAV scan runs as the first step in the processing pipeline
   **Then** the job streams the file buffer to the ClamAV `clamd` daemon via TCP on port 3310 (Docker network host: `CLAMAV_HOST`, default `"clamav"`)
   **And** if the scan returns clean, processing continues to magic byte check, then image optimization, then status → `ready`
   **And** if the scan detects a virus (FOUND response), the file is deleted from object storage, status → `quarantined`, `file.quarantined` event emitted
   **And** if the ClamAV sidecar is unreachable (TCP connection refused or timeout), the file record status updates to `pending_scan` — files in `pending_scan` state are NOT accessible to users — and the next job run will retry scanning
   **And** a Sentry alert fires if consecutive ClamAV scan failures span more than 15 minutes

5. **Given** the database needs file tracking
   **When** migration `0010` is applied
   **Then** the `platform_file_uploads` table is created with: `id` (UUID PK), `uploader_id` (UUID FK → `auth_users` CASCADE), `object_key` (VARCHAR(512) UNIQUE NOT NULL), `original_filename` (VARCHAR(255)), `file_type` (VARCHAR(50)), `file_size` (BIGINT), `status` (VARCHAR(20) DEFAULT `'processing'`), `processed_url` (TEXT), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

6. **Given** the file upload pipeline needs to be extensible
   **When** the `ScannerService` interface at `src/services/scanner-service.ts` is implemented
   **Then** both `NoOpScannerService` and `ClamAvScannerService` implement the same `ScannerService` interface, and `verifyMagicBytes()` is a standalone function always called by `processFileRecord`
   **And** `createScannerService()` returns the correct implementation based on `ENABLE_CLAMAV` env flag
   **And** ClamAV sidecar configuration is included (commented out) in `docker-compose.prod.yml` with memory limit 1.5GB, `freshclam` updates every 6 hours, and a health check

7. **Given** the upload endpoint needs to prevent abuse
   **When** an authenticated user calls `POST /api/upload/presign`
   **Then** the endpoint is rate-limited to 20 requests per hour per user (`RATE_LIMIT_PRESETS.FILE_UPLOAD_PRESIGN`)
   **And** unauthenticated requests return 401

## Tasks / Subtasks

- [x] Task 1: DB Migration 0010 — create `platform_file_uploads` table (AC: 5)
  - [x] Create `src/db/migrations/0010_file_uploads.sql`:
    ```sql
    CREATE TABLE platform_file_uploads (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      uploader_id      UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      object_key       VARCHAR(512) NOT NULL UNIQUE,
      original_filename VARCHAR(255),
      file_type        VARCHAR(50),
      file_size        BIGINT,
      status           VARCHAR(20) NOT NULL DEFAULT 'processing',
      processed_url    TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX platform_file_uploads_uploader_id_idx ON platform_file_uploads(uploader_id);
    CREATE INDEX platform_file_uploads_status_idx ON platform_file_uploads(status);
    ```
  - [x] Create `src/db/schema/file-uploads.ts` (Drizzle schema matching the SQL):
    - `status` as `varchar(20)` with `$type<'processing' | 'pending_scan' | 'ready' | 'quarantined' | 'deleted'>()`
  - [x] Add `import * as fileUploadsSchema from "@/db/schema/file-uploads"` to `src/db/index.ts` and spread into drizzle config
  - [x] **CRITICAL**: Hand-write migration SQL — do NOT run `drizzle-kit generate` (fails with `server-only` error — established project pattern)

- [x] Task 2: Upload configuration constants (AC: 1)
  - [x] Create `src/config/upload.ts` (no `import "server-only"` — this file is imported by both client component and server routes):

    ```typescript
    export type UploadCategory = "image" | "video" | "document" | "profile_photo";

    export const UPLOAD_ALLOWED_MIME_TYPES = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
      "video/mp4",
      "video/webm",
      "application/pdf",
    ] as const;

    export const UPLOAD_SIZE_LIMITS: Record<UploadCategory, number> = {
      image: 10 * 1024 * 1024, // 10MB
      video: 100 * 1024 * 1024, // 100MB
      document: 25 * 1024 * 1024, // 25MB
      profile_photo: 5 * 1024 * 1024, // 5MB
    };

    export const UPLOAD_CATEGORY_MIME_TYPES: Record<UploadCategory, readonly string[]> = {
      image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
      video: ["video/mp4", "video/webm"],
      document: ["application/pdf"],
      profile_photo: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    };

    // Srcset widths for responsive image generation
    export const IMAGE_SRCSET_WIDTHS = [400, 800, 1200] as const;
    ```

- [x] Task 3: Install required npm packages
  - [x] Run: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
    - S3-compatible client for Hetzner Object Storage presigned URL generation and object retrieval
  - [x] Run: `npm install sharp`
    - Image processing — WebP/AVIF conversion, responsive srcset generation (NFR-P12)
    - `sharp` has native binaries; may need `npm install --platform=linux --arch=x64 sharp` for Docker build targets
  - [x] Run: `npm install file-type`
    - Magic byte file type detection (v19+ is ESM-only)
    - **ESM INTEROP**: `file-type` v19+ requires dynamic import: `const { fileTypeFromBuffer } = await import("file-type")`
    - In `verifyMagicBytes()`, use `await import("file-type")` — do NOT use a static `import` statement
    - Alternative if ESM causes issues: pin to `file-type@16.5.4` (last CJS version) with `import { fileTypeFromBuffer } from "file-type"`

- [x] Task 4: Environment variables (AC: all)
  - [x] Add to `src/env.ts` server section:
    ```typescript
    // Hetzner Object Storage (S3-compatible)
    HETZNER_S3_ENDPOINT: z.string().min(1),
    HETZNER_S3_REGION: z.string().min(1),
    HETZNER_S3_BUCKET: z.string().min(1),
    HETZNER_S3_ACCESS_KEY_ID: z.string().min(1),
    HETZNER_S3_SECRET_ACCESS_KEY: z.string().min(1),
    HETZNER_S3_PUBLIC_URL: z.string().min(1),
    // ClamAV (optional)
    ENABLE_CLAMAV: z.string().optional().default("false"),
    CLAMAV_HOST: z.string().optional().default("clamav"),
    CLAMAV_PORT: z.coerce.number().int().positive().optional().default(3310),
    ```
  - [x] Add the corresponding `runtimeEnv` entries in `src/env.ts`
  - [x] Add to `.env.example`:

    ```
    # Hetzner Object Storage (S3-compatible)
    HETZNER_S3_ENDPOINT=https://nbg1.your-objectstorage.com
    HETZNER_S3_REGION=nbg1
    HETZNER_S3_BUCKET=igbo-uploads
    HETZNER_S3_ACCESS_KEY_ID=your-access-key-id
    HETZNER_S3_SECRET_ACCESS_KEY=your-secret-access-key
    HETZNER_S3_PUBLIC_URL=https://igbo-uploads.nbg1.your-objectstorage.com

    # ClamAV virus scanner (optional — production only)
    # Set to "true" to enable full virus scanning via ClamAV sidecar
    ENABLE_CLAMAV=false
    CLAMAV_HOST=clamav
    CLAMAV_PORT=3310
    ```

  - [x] **Important**: `@t3-oss/env-nextjs` uses `zod/v4` in this project — use `z.string()` not `z.url()` for endpoint (Hetzner endpoint format is valid URL but use `z.string().min(1)` to avoid validation complexity)

- [x] Task 5: Scanner Service interface + implementations (AC: 3, 4, 6)
  - [x] Create `src/services/scanner-service.ts` (`import "server-only"` as first line):

    ```typescript
    export interface ScanResult {
      clean: boolean;
      reason?: string; // "virus: {name}" or "invalid_type: detected {detected}, declared {declared}"
    }

    // ScannerService is for virus/malware scanning only.
    // Magic byte verification is a separate step in processFileRecord (always runs).
    export interface ScannerService {
      scan(objectKey: string, fileBuffer: Buffer): Promise<ScanResult>;
    }

    // No-op virus scanner for launch mode — always returns clean.
    // Magic byte verification is handled separately in processFileRecord.
    export class NoOpScannerService implements ScannerService {
      async scan(_objectKey: string, _fileBuffer: Buffer): Promise<ScanResult> {
        return { clean: true };
      }
    }

    export class ClamAvScannerService implements ScannerService {
      private host: string;
      private port: number;
      constructor() {
        this.host = env.CLAMAV_HOST ?? "clamav";
        this.port = env.CLAMAV_PORT ?? 3310;
      }
      async scan(objectKey: string, fileBuffer: Buffer): Promise<ScanResult> {
        // TCP INSTREAM protocol to ClamAV clamd daemon
        // Protocol: send "zINSTREAM\0", then 4-byte big-endian chunks of data,
        //           then 4 zero bytes (end-of-stream), read "stream: OK\n" or "stream: {virus} FOUND\n"
        // Throws on connection refused/timeout (caller handles pending_scan transition)
      }
    }

    // Standalone magic byte verification — called by processFileRecord ALWAYS,
    // regardless of which ScannerService is active.
    export async function verifyMagicBytes(fileBuffer: Buffer): Promise<ScanResult> {
      const { fileTypeFromBuffer } = await import("file-type");
      const result = await fileTypeFromBuffer(fileBuffer);
      if (!result) {
        return {
          clean: false,
          reason: "unknown_type: could not detect file type from magic bytes",
        };
      }
      if (
        !UPLOAD_ALLOWED_MIME_TYPES.includes(
          result.mime as (typeof UPLOAD_ALLOWED_MIME_TYPES)[number],
        )
      ) {
        return { clean: false, reason: `disallowed_type: ${result.mime}` };
      }
      return { clean: true };
    }

    export function createScannerService(): ScannerService {
      return env.ENABLE_CLAMAV === "true" ? new ClamAvScannerService() : new NoOpScannerService();
    }
    ```

  - [x] Import `env` from `@/env` and `UPLOAD_ALLOWED_MIME_TYPES` from `@/config/upload` in this service
  - [x] ClamAV INSTREAM protocol detail:
    1. Open TCP connection to `${CLAMAV_HOST}:${CLAMAV_PORT}`
    2. Send `Buffer.from("zINSTREAM\0")` (z-prefixed null-terminated command)
    3. For each chunk of the buffer (4096 bytes max): send 4-byte big-endian length + chunk
    4. Send 4 zero bytes: `Buffer.alloc(4)` to signal end
    5. Read response: `"stream: OK"` → clean, `"stream: VirusName FOUND"` → infected
    6. Set socket timeout (e.g. 30 seconds) — timeout throws, caller marks as `pending_scan`

- [x] Task 6: DB queries for file uploads (AC: 2, 7)
  - [x] Create `src/db/queries/file-uploads.ts`:
    - `createFileUpload(data: { uploaderId: string; objectKey: string; originalFilename?: string; fileType?: string; fileSize?: number }): Promise<PlatformFileUpload>`
    - `getFileUploadByKey(objectKey: string): Promise<PlatformFileUpload | null>`
    - `getFileUploadById(id: string): Promise<PlatformFileUpload | null>`
    - `updateFileUpload(id: string, data: Partial<Pick<PlatformFileUpload, 'status' | 'processedUrl'>>): Promise<void>`
    - `findProcessingFileUploads(): Promise<PlatformFileUpload[]>` — `WHERE status = 'processing'`
    - `findPendingScanFileUploads(): Promise<PlatformFileUpload[]>` — `WHERE status = 'pending_scan'`
    - `deleteFileUploadByKey(objectKey: string): Promise<void>`
  - [x] Use Drizzle `db.select().from(fileUploadsSchema.platformFileUploads).where(...)` pattern
  - [x] Export `type PlatformFileUpload` inferred from `fileUploadsSchema.platformFileUploads.$inferSelect`

- [x] Task 7: File Upload Service (AC: 1, 2)
  - [x] Create `src/services/file-upload-service.ts` (`import "server-only"` as first line):
    - `getS3Client()`: creates `S3Client` from `@aws-sdk/client-s3`:
      ```typescript
      import { S3Client } from "@aws-sdk/client-s3";
      import { env } from "@/env";
      function getS3Client(): S3Client {
        return new S3Client({
          endpoint: env.HETZNER_S3_ENDPOINT,
          region: env.HETZNER_S3_REGION,
          credentials: {
            accessKeyId: env.HETZNER_S3_ACCESS_KEY_ID,
            secretAccessKey: env.HETZNER_S3_SECRET_ACCESS_KEY,
          },
          // Hetzner uses path-style URLs
          forcePathStyle: true,
        });
      }
      ```
    - `generatePresignedUploadUrl(params: { uploaderId: string; filename: string; mimeType: string; sizeBytes: number; category: UploadCategory }): Promise<{ uploadUrl: string; objectKey: string; fileUploadId: string }>`:
      - Validate `mimeType` against `UPLOAD_CATEGORY_MIME_TYPES[category]` — throw `ApiError` 400 if not allowed
      - Validate `sizeBytes <= UPLOAD_SIZE_LIMITS[category]` — throw `ApiError` 400 if exceeded
      - Generate `objectKey = \`uploads/${uploaderId}/${randomUUID()}-${sanitizeFilename(filename)}\``
      - Create `PutObjectCommand({ Bucket, Key: objectKey, ContentType: mimeType, ContentLength: sizeBytes })` — `ContentLength` in the signed command creates a signature condition; S3 rejects uploads with mismatched size (prevents bait-and-switch per AC 1)
      - `const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })`
      - Insert `platform_file_uploads` row via `createFileUpload()`
      - Return `{ uploadUrl, objectKey, fileUploadId }`
    - `confirmUpload(objectKey: string, authenticatedUserId: string): Promise<void>`:
      - `const record = await getFileUploadByKey(objectKey)` — throw `ApiError` 404 if not found
      - Verify `record.uploaderId === authenticatedUserId` — throw `ApiError` 403 if not owner
      - Call `runJob("file-processing")` to trigger the pipeline
    - `fetchFileBuffer(objectKey: string): Promise<Buffer>`:
      - Uses `GetObjectCommand({ Bucket, Key: objectKey })` to fetch file from Hetzner
      - Converts `Body` stream to `Buffer` — use `streamToBuffer(body as Readable)` helper
    - `deleteObject(objectKey: string): Promise<void>`:
      - Uses `DeleteObjectCommand({ Bucket, Key: objectKey })`
    - Helper `sanitizeFilename(filename: string): string` — strip path separators, limit to 100 chars

- [x] Task 8: File Processing Background Job (AC: 2, 3, 4, 7)
  - [x] Create `src/server/jobs/file-processing.ts` (`import "server-only"` as first line):

    ```typescript
    import "server-only";
    import { registerJob } from "@/server/jobs/job-runner";
    // ... imports

    registerJob("file-processing", async () => {
      const scanner = createScannerService();
      const processing = await findProcessingFileUploads();
      const pendingScan = await findPendingScanFileUploads();
      for (const file of [...processing, ...pendingScan]) {
        await processFileRecord(file, scanner);
      }
    });
    ```

  - [x] `processFileRecord(file: PlatformFileUpload, scanner: ScannerService): Promise<void>`:
    1. Fetch file bytes from Hetzner: `const buffer = await fetchFileBuffer(file.objectKey)` (from file-upload-service)
       - **On fetch error** (object missing/corrupted): `await updateFileUpload(file.id, { status: 'quarantined' })`, emit `file.quarantined` event with reason `"fetch_failed"`, return
    2. **Virus scan** (ClamAV when enabled, no-op when disabled): `const scanResult = await scanner.scan(file.objectKey, buffer)` — wrap in try/catch for ClamAV TCP errors
    3. **On connection error** (ClamAV unreachable): `await updateFileUpload(file.id, { status: 'pending_scan' })` — do NOT mark quarantined; return (job runner retry handles it)
    4. **On `!scanResult.clean`**: `await deleteObject(file.objectKey)`, `await updateFileUpload(file.id, { status: 'quarantined' })`, emit `file.quarantined` event; return
    5. **Magic byte verification** (ALWAYS runs, regardless of scanner): `const magicResult = await verifyMagicBytes(buffer)` — import from `@/services/scanner-service`
    6. **On `!magicResult.clean`**: `await deleteObject(file.objectKey)`, `await updateFileUpload(file.id, { status: 'quarantined' })`, emit `file.quarantined` event; return
    7. **Image optimization** (if MIME type starts with `image/`):
       - For each width in `IMAGE_SRCSET_WIDTHS` (400, 800, 1200):
         - `sharp(buffer).resize(width).webp({ quality: 85 }).toBuffer()` → upload to `${objectKey}-${width}w.webp`
       - Also generate AVIF: `sharp(buffer).resize(1200).avif({ quality: 60 }).toBuffer()` → upload as primary
       - Set `processed_url` = `${HETZNER_S3_PUBLIC_URL}/${objectKey}` (original + variants accessible by convention)
       - Non-image files: `processed_url` = `${HETZNER_S3_PUBLIC_URL}/${objectKey}` directly
    8. `await updateFileUpload(file.id, { status: 'ready', processedUrl: processed_url })`
    9. Emit `file.processed` EventBus event: `eventBus.emit("file.processed", { fileUploadId: file.id, uploaderId: file.uploaderId, ... })`
  - [x] Register in `src/server/jobs/index.ts` — add `import "./file-processing"` alongside existing job imports
  - [x] **EventBus**: `emit()` is synchronous (Node.js EventEmitter) — no `await` needed

- [x] Task 9: Update events.ts for new file events (AC: 3, 4)
  - [x] Add to `src/types/events.ts`:
    ```typescript
    // --- File Upload Events ---
    export interface FileProcessedEvent extends BaseEvent {
      fileUploadId: string;
      uploaderId: string;
      objectKey: string;
      processedUrl: string;
    }
    export interface FileQuarantinedEvent extends BaseEvent {
      fileUploadId: string;
      uploaderId: string;
      objectKey: string;
      reason: string;
    }
    ```
  - [x] Add `"file.processed"` and `"file.quarantined"` to `EventName` union
  - [x] Add `"file.processed": FileProcessedEvent` and `"file.quarantined": FileQuarantinedEvent` to `EventMap` interface

- [x] Task 10: Update rate-limiter presets (AC: 7)
  - [x] Add to `RATE_LIMIT_PRESETS` in `src/services/rate-limiter.ts`:
    ```typescript
    // File upload endpoints
    FILE_UPLOAD_PRESIGN: { maxRequests: 20, windowMs: 3_600_000 }, // 20/hour per userId
    ```

- [x] Task 11: API Routes (AC: 1, 2, 7)
  - [x] Create `src/app/api/upload/presign/route.ts`:
    ```typescript
    // POST /api/upload/presign
    // Body: { filename: string; mimeType: string; sizeBytes: number; category: UploadCategory }
    // Auth: requireAuthenticatedSession()
    // Rate limit: FILE_UPLOAD_PRESIGN (20/hr per user)
    // Returns: 200 { data: { uploadUrl: string; objectKey: string; fileUploadId: string } }
    // Errors: 400 (invalid type/size), 401 (not authenticated), 422 (validation), 429 (rate limited)
    export const POST = withApiHandler(handler, {
      rateLimit: {
        key: async (req) => {
          const ip = req.headers.get("x-client-ip") ?? "anonymous";
          const session = await auth();
          return `file-upload-presign:${session?.user?.id ?? ip}`;
        },
        ...RATE_LIMIT_PRESETS.FILE_UPLOAD_PRESIGN,
      },
    });
    ```
  - [x] Import `auth` from `@/server/auth/config` (NOT `@/auth` — that file does NOT exist in this project)
  - [x] Zod validation schema: `z.object({ filename: z.string().min(1).max(255), mimeType: z.string().min(1), sizeBytes: z.number().int().positive(), category: z.enum(['image', 'video', 'document', 'profile_photo']) })`
  - [x] On validation error use `.issues[0]` (not `.errors[0]`) — Zod v4 pattern
  - [x] Create `src/app/api/upload/confirm/route.ts`:
    ```typescript
    // POST /api/upload/confirm
    // Body: { objectKey: string }
    // Auth: requireAuthenticatedSession() — verifies uploader_id === session user
    // Returns: 200 { data: { message: "Upload received. Processing will begin shortly." } }
    // Errors: 401 (not authenticated), 403 (not owner), 404 (object key not found)
    export const POST = withApiHandler(handler);
    ```
  - [x] **Route path**: `/api/upload/` NOT `/api/v1/upload/` — architecture specifies unversioned upload routes
  - [x] Both routes use `requireAuthenticatedSession()` from `@/services/permissions.ts`
  - [x] `successResponse()` from `@/lib/api-response` for success responses

- [x] Task 12: Shared FileUpload Component (AC: 1, 2)
  - [x] Create `src/components/shared/FileUpload.tsx` (`"use client"` directive):
    ```typescript
    interface FileUploadProps {
      category: UploadCategory;
      onUploadComplete: (fileUploadId: string, objectKey: string) => void;
      onError?: (error: string) => void;
      accept?: string; // e.g. "image/*" — fallback to UPLOAD_CATEGORY_MIME_TYPES[category]
      disabled?: boolean;
    }
    ```
  - [x] Upload flow:
    1. User selects file via `<input type="file" />`
    2. Client calls `fetch('/api/upload/presign', { method: 'POST', body: JSON.stringify({ filename, mimeType: file.type, sizeBytes: file.size, category }) })`
    3. Client uploads directly to Hetzner via presigned URL: `fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })`
    4. Client calls `fetch('/api/upload/confirm', { method: 'POST', body: JSON.stringify({ objectKey }) })`
    5. Calls `onUploadComplete(fileUploadId, objectKey)`
  - [x] Show upload progress (use `XMLHttpRequest` for progress events — `fetch` doesn't expose upload progress)
  - [x] All strings via `useTranslations("fileUpload")` — no hardcoded strings
  - [x] **Do NOT** use `next-auth/react` `useSession()` in this component — it receives `category` as a prop, auth is handled by the API route

- [x] Task 13: i18n strings (AC: UI)
  - [x] Add `fileUpload` namespace to `messages/en.json`:
    ```json
    "fileUpload": {
      "selectFile": "Select file",
      "dragAndDrop": "Drag and drop a file here, or click to select",
      "uploading": "Uploading...",
      "processing": "Processing...",
      "uploadComplete": "Upload complete",
      "errorInvalidType": "File type not allowed",
      "errorTooLarge": "File is too large. Maximum size: {maxSize}",
      "errorUploadFailed": "Upload failed. Please try again.",
      "errorQuarantined": "Your file could not be uploaded. Please try a different file."
    }
    ```
  - [x] Add corresponding Igbo translations to `messages/ig.json`

- [x] Task 14: Docker Compose ClamAV sidecar (AC: 6)
  - [x] Check if `docker-compose.prod.yml` exists at project root; create if not
  - [x] Add ClamAV sidecar service entry (commented out by default):
    ```yaml
    # ClamAV virus scanner (optional — enable for production by setting ENABLE_CLAMAV=true)
    # Memory: ~1.5GB minimum required for virus definitions database
    # To enable: uncomment this service AND set ENABLE_CLAMAV=true in environment
    # clamav:
    #   image: clamav/clamav:stable
    #   restart: unless-stopped
    #   mem_limit: 1.5g
    #   healthcheck:
    #     test: ["CMD", "clamdcheck"]
    #     interval: 60s
    #     timeout: 10s
    #     retries: 3
    #   networks:
    #     - app-network
    ```

- [x] Task 15: Tests (AC: all)
  - [x] `src/services/scanner-service.test.ts`:
    - `@vitest-environment node`
    - Mock `file-type` dynamic import for `verifyMagicBytes`: `vi.mock("file-type", () => ({ fileTypeFromBuffer: vi.fn() }))`
    - Mock `net` module for `ClamAvScannerService`: `vi.mock("net", ...)` with mock socket
    - Test: `verifyMagicBytes` returns `{ clean: true }` when detected MIME is on allowed list
    - Test: `verifyMagicBytes` returns `{ clean: false }` when detected MIME is not on allowed list
    - Test: `verifyMagicBytes` returns `{ clean: false }` when `fileTypeFromBuffer` returns null (unknown type)
    - Test: `NoOpScannerService` always returns `{ clean: true }`
    - Test: `ClamAvScannerService` returns `{ clean: true }` when ClamAV responds `"stream: OK\n"`
    - Test: `ClamAvScannerService` returns `{ clean: false }` when ClamAV responds `"stream: Eicar FOUND\n"`
    - Test: `ClamAvScannerService` throws when TCP connection is refused (caller catches for `pending_scan`)
    - Test: `createScannerService()` returns `NoOpScannerService` when `ENABLE_CLAMAV` is not `"true"`
    - Test: `createScannerService()` returns `ClamAvScannerService` when `ENABLE_CLAMAV` is `"true"`
  - [x] `src/services/file-upload-service.test.ts`:
    - `@vitest-environment node`
    - Mock `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
    - Mock `@/db/queries/file-uploads`
    - Mock `@/server/jobs` (for `runJob`)
    - Test: `generatePresignedUploadUrl` throws 400-equivalent error for disallowed MIME type
    - Test: `generatePresignedUploadUrl` throws 400-equivalent error when `sizeBytes > UPLOAD_SIZE_LIMITS[category]`
    - Test: `generatePresignedUploadUrl` returns `{ uploadUrl, objectKey, fileUploadId }` for valid params
    - Test: `confirmUpload` throws 404 when `objectKey` not found in DB
    - Test: `confirmUpload` throws 403 when `uploaderId !== authenticatedUserId`
    - Test: `confirmUpload` calls `runJob("file-processing")` on success
  - [x] `src/server/jobs/file-processing.test.ts`:
    - `@vitest-environment node`
    - Use `vi.hoisted()` for `mockRegisterJob` — **critical pattern from Story 1.13** (mock factory runs before `let` declarations, causing TDZ error without hoisting)
    - Mock `@/db/queries/file-uploads`, `@/services/scanner-service`, `@/services/file-upload-service`, `@/services/event-bus`
    - Test: job calls `processFileRecord` for each file in `processing` and `pending_scan` status
    - Test: `processFileRecord` quarantines when `fetchFileBuffer` throws (object missing in S3)
    - Test: `processFileRecord` quarantines when virus scanner returns `{ clean: false }` (ClamAV detects virus)
    - Test: `processFileRecord` quarantines when `verifyMagicBytes` returns `{ clean: false }` (magic byte mismatch)
    - Test: `processFileRecord` sets status `ready` and `processedUrl` when both scans pass
    - Test: `processFileRecord` emits `file.processed` event on success
    - Test: `processFileRecord` emits `file.quarantined` event on scan failure
    - Test: `processFileRecord` sets status `pending_scan` on ClamAV TCP connection error (does NOT quarantine)
    - Test: `processFileRecord` always calls `verifyMagicBytes` even when ClamAV is the active scanner
  - [x] `src/app/api/upload/presign/route.test.ts`:
    - `@vitest-environment node`
    - Mock `@/services/file-upload-service`, `@/services/permissions`, `@/server/auth/config`, `@/lib/rate-limiter`
    - Note: `withApiHandler` with `rateLimit` option uses dynamic `await import("@/lib/rate-limiter")` internally — must mock `@/lib/rate-limiter` (established Story 1.12 pattern)
    - Test: 200 `{ data: { uploadUrl, objectKey, fileUploadId } }` for valid authenticated request
    - Test: 400 for invalid MIME type (service rejects)
    - Test: 400 for oversized file
    - Test: 401 for unauthenticated request
    - Test: 429 with `X-RateLimit-*` headers on rate limit exceeded (mock `checkRateLimit` to return `{ allowed: false, ... }`)
  - [x] `src/app/api/upload/confirm/route.test.ts`:
    - `@vitest-environment node`
    - Mock `@/services/file-upload-service`, `@/services/permissions`, `@/server/auth/config`
    - Test: 200 `{ data: { message: "..." } }` for valid authenticated request with owned objectKey
    - Test: 404 for unknown objectKey
    - Test: 403 for objectKey owned by different user
    - Test: 401 for unauthenticated
  - [x] `src/components/shared/FileUpload.test.tsx`:
    - `@testing-library/react` (client component — no `@vitest-environment node` annotation)
    - Mock global `fetch` for presign and confirm API calls
    - Test: renders file input element
    - Test: calls presign endpoint when file selected; calls Hetzner URL; calls confirm endpoint
    - Test: calls `onUploadComplete(fileUploadId, objectKey)` after successful flow
    - Test: calls `onError` (or shows error UI) when presign returns error response
    - Test: shows upload progress indicator during upload
  - [x] **Baseline: 667/667 passing** (after Story 1.13 review fixes). Expect ~40–50 new tests.
  - [x] **Pre-existing failure**: `ProfileStep.test.tsx` (1 test since Story 1.9) — do NOT investigate

## Dev Notes

### Developer Context

Story 1.14 builds the foundational file upload infrastructure used by ALL future stories that handle media:

- Profile photos (Story 1.9 currently uses a direct URL field — this pipeline provides the upload mechanism)
- Chat attachments (Story 2.4 will reference `platform_file_uploads.id`)
- Post media (Story 4.2 will use this pipeline)
- Article images (Story 6.1 will use this pipeline)
- Group banners (Story 5.1 will use this pipeline)

**What this story adds:**

1. Presigned URL generation (client uploads directly to Hetzner — server never handles file bytes)
2. File DB tracking (`platform_file_uploads` table)
3. `ScannerService` interface with two implementations (magic byte for launch, ClamAV for production)
4. `sharp` image optimization pipeline (WebP/AVIF + srcset per NFR-P12)
5. `FileUpload.tsx` shared React component for all upload UIs
6. Rate limiting on presign endpoint

**Architecture rationale** (from `_bmad-output/planning-artifacts/architecture.md` line ~296-307):

> "Keeps Node.js server free for API requests, scales independently — client uploads directly to object storage, app server never handles file bytes"

**Launch vs. production scanning:**

- **Launch** (< 500 members): `NoOpScannerService` (no virus scan) + `verifyMagicBytes()` (always runs). Magic byte validation provides primary security without 1.5GB ClamAV memory overhead.
- **Production**: Set `ENABLE_CLAMAV=true`, uncomment ClamAV sidecar in `docker-compose.prod.yml`.
- The `ScannerService` abstraction means zero code changes are needed to switch between them.

**⚠️ `file-type` ESM compatibility**: `file-type` v19+ is ESM-only. Use dynamic import inside `verifyMagicBytes()`:

```typescript
const { fileTypeFromBuffer } = await import("file-type");
```

Do NOT use a static top-level `import { fileTypeFromBuffer } from "file-type"` — it will fail in a CJS/mixed context. If ESM interop causes build issues, pin to `file-type@16.5.4` (last CJS version) and use static import.

**⚠️ `sharp` native binaries**: `sharp` compiles native code per OS/architecture. In Docker builds:

- Add to Dockerfile: `RUN npm install --platform=linux --arch=x64 sharp` (or use `SHARP_IGNORE_GLOBAL_LIBVIPS=1`)
- Do NOT ship locally-compiled `sharp` binaries into the Docker image — rebuild for the target platform.

**⚠️ Hetzner S3 configuration**: Hetzner Object Storage is S3-compatible but uses path-style URLs. Set `forcePathStyle: true` on the `S3Client`. The endpoint format is typically `https://{region}.your-objectstorage.com`.

**⚠️ Job runner pattern — no payload**: `runJob(name: string): Promise<boolean>` accepts NO payload argument (established in Stories 1.1c, 1.13). The file-processing job polls `platform_file_uploads` WHERE `status IN ('processing', 'pending_scan')`. This means if many files are uploading simultaneously, one job run processes all of them — this is correct behavior for Phase 1.

**⚠️ `confirmUpload` ownership check**: The confirm route must verify that the authenticated user owns the `platform_file_uploads` record (i.e., `uploaderId === session.user.id`). Without this, any authenticated user could trigger processing of another user's upload.

**⚠️ `eventBus.emit()` is synchronous**: It returns `boolean` (Node.js EventEmitter), not a Promise. No `await`. Call it AFTER updating DB status.

**⚠️ EventBus naming convention**: Use underscores as separators (existing: `member.password_reset`, `member.2fa_setup`). New events: `file.processed`, `file.quarantined`.

**Scope boundaries — do NOT implement in this story:**

- Profile photo integration UI (Story 1.9 already has a placeholder URL field — wiring FileUpload component to profile settings will happen when revisiting profile management or in a separate task)
- Chat file attachments (Story 2.4)
- CDN cache warming via Cloudflare API (document the TODO in the job — Cloudflare cache purge API call after upload completes)
- Sentry alerting for ClamAV unavailability beyond 15 minutes (note the TODO — track consecutive failures in Redis, alert when threshold exceeded)
- Video processing (transcoding is out of scope — videos are stored as-is, only images get srcset optimization)
- Periodic job trigger for `pending_scan` retry (epics specify "retries every 5 minutes" — currently `file-processing` only runs when triggered by `confirmUpload`; files stuck in `pending_scan` are retried only when another upload is confirmed. Add a TODO comment in the job: `// TODO: Epic 12 infrastructure story should add a periodic cron trigger (e.g., every 5 min) for runAllDueJobs() to ensure pending_scan files are retried`)
- S3 object cleanup on account anonymization (`platform_file_uploads` records persist after anonymization since Story 1.13 uses soft-delete, not hard-delete — add a TODO: `// TODO: Future story should clean up S3 objects when accounts are anonymized`)

### Architecture Compliance

- `import "server-only"` as first line in: `src/services/scanner-service.ts`, `src/services/file-upload-service.ts`, `src/server/jobs/file-processing.ts`, `src/db/queries/file-uploads.ts`
- **Do NOT add `server-only` to** `src/config/upload.ts` — it's imported by `FileUpload.tsx` client component
- DB queries in `src/db/queries/file-uploads.ts` — services never write raw Drizzle queries
- Background job in `src/server/jobs/file-processing.ts` — triggered via `runJob()`, never called directly from components
- **No `schema/index.ts`**: add `import * as fileUploadsSchema from "@/db/schema/file-uploads"` directly in `src/db/index.ts`
- Upload API routes at `/api/upload/` (NOT `/api/v1/upload/`) — architecture specifies unversioned upload routes
- RFC 7807 error format via `errorResponse()` from `@/lib/api-response` (handled in `withApiHandler`)
- Rate limiting via `withApiHandler()` `rateLimit` option (Story 1.12 pattern)
- `auth()` import from `@/server/auth/config` (NOT `@/auth` — that file does NOT exist)
- All user-facing strings via `useTranslations()` — no hardcoded strings in `FileUpload.tsx`
- EventBus: emit from services/jobs, never from route handlers or components
- **Zod**: `import { z } from "zod/v4"` — use `.issues[0]` (not `.errors[0]`) for validation errors

### Library/Framework Requirements

- **`@aws-sdk/client-s3`** — NEW dependency; install with npm. S3Client + PutObjectCommand + GetObjectCommand + DeleteObjectCommand
- **`@aws-sdk/s3-request-presigner`** — NEW dependency. `getSignedUrl()` for presigned PUT URL generation
- **`sharp`** — NEW dependency; install with npm. Image optimization, WebP/AVIF conversion, resize for srcset. Native binary — see platform note above.
- **`file-type`** — NEW dependency; install with npm. Magic byte detection. Use v19+ with dynamic import, or v16 for CJS.
- **`zod/v4`**: `import { z } from "zod/v4"` — use `.issues[0]` (not `.errors[0]`)
- **`@t3-oss/env-nextjs`**: Already in use at `src/env.ts` — add new Hetzner env vars there
- **`next-auth/react`**: Do NOT use `useSession()` in `FileUpload.tsx` — auth is handled server-side by the API routes
- **`node:net`**: Node.js built-in for ClamAV TCP INSTREAM protocol in `ClamAvScannerService`
- **`node:crypto`**: `randomUUID()` for generating unique object keys — `import { randomUUID } from "node:crypto"`

### File Structure Requirements

**New files:**

- `src/db/migrations/0010_file_uploads.sql`
- `src/db/schema/file-uploads.ts`
- `src/db/queries/file-uploads.ts`
- `src/config/upload.ts`
- `src/services/scanner-service.ts`
- `src/services/scanner-service.test.ts`
- `src/services/file-upload-service.ts`
- `src/services/file-upload-service.test.ts`
- `src/server/jobs/file-processing.ts`
- `src/server/jobs/file-processing.test.ts`
- `src/app/api/upload/presign/route.ts`
- `src/app/api/upload/presign/route.test.ts`
- `src/app/api/upload/confirm/route.ts`
- `src/app/api/upload/confirm/route.test.ts`
- `src/components/shared/FileUpload.tsx`
- `src/components/shared/FileUpload.test.tsx`

**Modified files:**

- `src/db/index.ts` — add `fileUploadsSchema` import
- `src/types/events.ts` — add `FileProcessedEvent`, `FileQuarantinedEvent` interfaces + EventName + EventMap entries
- `src/services/rate-limiter.ts` — add `FILE_UPLOAD_PRESIGN` to `RATE_LIMIT_PRESETS`
- `src/server/jobs/index.ts` — add `import "./file-processing"`
- `src/env.ts` — add Hetzner S3 + ClamAV env vars
- `messages/en.json` — add `fileUpload` namespace
- `messages/ig.json` — add `fileUpload` namespace (Igbo translations)
- `.env.example` — add Hetzner S3 and ClamAV env var templates
- `docker-compose.prod.yml` — add ClamAV sidecar (commented out)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

**Do NOT create:**

- `src/features/uploads/` — there is no `features/uploads` directory pattern for this; use `src/services/` and `src/components/shared/`
- `src/app/api/v1/upload/` — upload routes are unversioned per architecture (`/api/upload/`)
- `src/lib/s3.ts` — S3 client creation goes in `src/services/file-upload-service.ts`

### Testing Requirements

- `@vitest-environment node` annotation required on ALL `.test.ts` server-side test files
- `FileUpload.test.tsx` is a React component test — uses `@testing-library/react`, no `@vitest-environment` header (defaults to jsdom)
- **`vi.hoisted()` REQUIRED** in `file-processing.test.ts` for mocking `registerJob` — the mock factory runs before `let` declarations, causing TDZ (temporal dead zone) errors without hoisting. Established pattern from Story 1.13 debug.
- Mock `@/lib/rate-limiter` AND `@/server/auth/config` in presign route test — `withApiHandler` uses dynamic `await import("@/lib/rate-limiter")` internally (established Story 1.12 pattern)
- Test mock fixture for `AuthUser` must include `languagePreference: "en"` (added in Story 1.11)
- Test 429 body format: `{ type: "about:blank", title: "Too Many Requests", status: 429 }`
- `vi.clearAllMocks()` in `beforeEach`
- Co-locate tests with source files (no `__tests__` directories)
- **Baseline**: 667/667 passing after Story 1.13. Expect ~40–50 new tests.
- **Pre-existing failure**: `ProfileStep.test.tsx` (1 test since Story 1.9) — do NOT investigate

### Previous Story Intelligence (1.13)

- **`vi.hoisted()` required** for mocking `registerJob` in job test files — `mockRegisterJob` and `handlerRef` declared with `vi.hoisted()` then referenced in `vi.mock()` factory. Without hoisting, `let` declarations are in TDZ when mock factory runs.
- **Dynamic import of rate-limiter**: `withApiHandler` uses `await import("@/lib/rate-limiter")` — route tests must `vi.mock("@/lib/rate-limiter", ...)`.

### Git Intelligence Summary

- **Migration pattern**: Hand-written SQL in `src/db/migrations/NNNN_name.sql`, paired with matching Drizzle schema in `src/db/schema/`. Both files created together. Import in `src/db/index.ts` as `import * as xSchema from "@/db/schema/x"`.
- **Schema no-index**: No central `schema/index.ts` — import each schema file directly in `src/db/index.ts`.
- **Job registration pattern**: `registerJob(name, handler)` in the job file (side-effect import), then `import "./job-name"` in `src/server/jobs/index.ts`.
- **API route pattern**: All routes export via `withApiHandler()`. User self-service routes start with `requireAuthenticatedSession()`. Admin routes start with `requireAdminSession()`.
- **Upload routes unversioned**: Architecture specifies `/api/upload/presign` — NOT under `/api/v1/`.
- **Recent commit pattern**: Commits include story number and brief description, e.g. "Implement Story 1-13 (GDPR Compliance...)".

### Latest Technical Context

- **Hetzner Object Storage**: S3-compatible API. Use `@aws-sdk/client-s3` with `forcePathStyle: true` and a custom `endpoint`. Presigned PUT URLs work the same as AWS S3. Pricing: ~€0.005/GB/month storage + egress.
- **AWS SDK v3 presigned URLs**: `getSignedUrl(client, new PutObjectCommand({...}), { expiresIn: 3600 })` from `@aws-sdk/s3-request-presigner`. The `ContentLength` in `PutObjectCommand` creates a signing condition — if client uploads different size, signature validation fails.
- **`sharp` performance**: Pre-converts images server-side. For production, consider running `sharp` in the worker/background job rather than the main web container to avoid CPU spikes during image processing. This story uses the existing job runner which runs in the web container — acceptable for Phase 1.
- **ClamAV INSTREAM protocol** (TCP): The clamd INSTREAM command is the most reliable for stream scanning. Alternative: `SCAN` command with file path (requires shared filesystem). INSTREAM is preferred for containers. Total message: `"zINSTREAM\0"` + chunks (4-byte length prefix + data) + 4 zero bytes. Response: one line, e.g. `"stream: OK"` or `"stream: Eicar-Test-Signature FOUND"`.
- **`file-type` v19 async detection**: `fileTypeFromBuffer(buffer: Uint8Array | ArrayBuffer): Promise<FileTypeResult | undefined>`. Returns `{ ext, mime }` or `undefined` if type cannot be detected (binary blob, text files). Always check for `undefined`.
- **WebP vs AVIF**: WebP has near-universal browser support (97%+). AVIF is newer with ~91% support but significantly better compression (30-50% smaller than WebP). Strategy: generate both and serve AVIF with WebP fallback via `<picture>` element — implement this in the consuming component (e.g. `<Avatar>`, `<Image>` wrapper). The processing job stores both variants with URL convention.

### Project Structure Notes

- **Upload API path**: `src/app/api/upload/presign/route.ts` and `src/app/api/upload/confirm/route.ts` — outside the `/api/v1/` versioned namespace by design (architecture lines 776-778).
- **`src/config/upload.ts`**: New `config/` directory (first file in this location). Contains pure constants with no server-side imports — safe to import in both client and server contexts.
- **`src/components/shared/FileUpload.tsx`**: Joins `Avatar.tsx`, `CookieConsentBanner.tsx`, `LanguageToggle.tsx`, etc. in the shared components directory.
- **`docker-compose.prod.yml`**: Check if this file exists at project root. If it does, add the ClamAV sidecar. If it doesn't exist, create a minimal one with just the ClamAV section commented out.
- **`src/server/jobs/index.ts`**: Currently exports from `job-runner` and imports `./retention-cleanup` + `./data-export`. Add `import "./file-processing"` to the import list.

### References

- Architecture: `_bmad-output/planning-artifacts/architecture.md` — File Upload Pipeline (lines ~296-307), `/api/upload/presign` route (line ~1101), `FileUpload.tsx` component (line ~996), `file-processing.ts` job (line ~1053)
- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.14` — Full acceptance criteria and technical requirements
- Job runner: `src/server/jobs/job-runner.ts` — `registerJob()`, `runJob()` (no payload), `JobHandler` type
- Job index: `src/server/jobs/index.ts` — pattern for registering jobs via side-effect imports
- Story 1.13 notes: `_bmad-output/implementation-artifacts/1-13-gdpr-compliance-data-privacy.md` — `vi.hoisted()` pattern, job context via Redis, `runJob()` no-payload constraint
- API middleware: `src/server/api/middleware.ts` — `withApiHandler()` with dynamic rate-limiter import
- Rate limiter presets: `src/services/rate-limiter.ts` — `RATE_LIMIT_PRESETS` pattern to extend
- Events: `src/types/events.ts` — EventName union + EventMap interface to extend
- Permissions: `src/services/permissions.ts` — `requireAuthenticatedSession()`
- Env validation: `src/env.ts` — `@t3-oss/env-nextjs` with `zod/v4` pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **`vi.hoisted()` TDZ fix (scanner-service.test.ts)**: Mock factory for `node:net` referenced `mockSocket` before it was initialized. Fixed by hoisting `mockSocket`, `socketEventHandlers`, and `mockEnv` via `vi.hoisted()`.
- **`vi.hoisted()` TDZ fix (file-upload-service.test.ts)**: Mock factory for `@aws-sdk/client-s3` referenced `mockS3Send` before declaration. Fixed with `vi.hoisted()` + regular `function(){}` constructors (not arrow functions) in mock factory.
- **`mockRegisterJob` call count 0 (file-processing.test.ts)**: `vi.clearAllMocks()` in `beforeEach` cleared `mockRegisterJob` call history before assertions ran. `registerJob` fires at module load time, not per-test. Fixed by checking `handlerRef.current` (plain object ref, not a spy) — established pattern from Story 1.13.
- **`file-type` v21 ESM-only**: Used dynamic `await import("file-type")` inside `verifyMagicBytes()`. Mocked with `vi.mock("file-type", ...)` in test.

### Completion Notes List

- All 15 tasks implemented. `file-type` v21 is ESM-only; dynamic import pattern used and confirmed working.
- `vi.hoisted()` required in 3 of 6 test files due to `vi.mock()` factory TDZ. Pattern is now documented in memory.
- `handlerRef.current` pattern used in `file-processing.test.ts` (same as Story 1.13 `data-export.test.ts`) — `vi.clearAllMocks()` clears spy call counts but not plain object refs.
- ClamAV sidecar added to `docker-compose.prod.yml` (commented out). `NoOpScannerService` active at launch; switch to `ClamAvScannerService` by setting `ENABLE_CLAMAV=true`.
- Image optimization: `sharp` generates WebP srcset at 400/800/1200px + AVIF at 1200px. Non-image files pass through unchanged.
- Upload routes are unversioned (`/api/upload/`) per architecture spec — confirmed different from v1 routes.
- **Final test count: 712/712 passing** (+45 new tests from 667 baseline). 6 new test files.

### File List

**New files:**

- `src/db/migrations/0010_file_uploads.sql`
- `src/db/schema/file-uploads.ts`
- `src/db/queries/file-uploads.ts`
- `src/config/upload.ts`
- `src/services/scanner-service.ts`
- `src/services/scanner-service.test.ts`
- `src/services/file-upload-service.ts`
- `src/services/file-upload-service.test.ts`
- `src/server/jobs/file-processing.ts`
- `src/server/jobs/file-processing.test.ts`
- `src/app/api/upload/presign/route.ts`
- `src/app/api/upload/presign/route.test.ts`
- `src/app/api/upload/confirm/route.ts`
- `src/app/api/upload/confirm/route.test.ts`
- `src/components/shared/FileUpload.tsx`
- `src/components/shared/FileUpload.test.tsx`
- `docker-compose.prod.yml`

**Modified files:**

- `package.json` — added `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `sharp`, `file-type` dependencies
- `package-lock.json` — lockfile update for new dependencies
- `src/db/index.ts` — added `fileUploadsSchema` import + drizzle spread
- `src/types/events.ts` — added `FileProcessedEvent`, `FileQuarantinedEvent`, EventName + EventMap entries
- `src/services/rate-limiter.ts` — added `FILE_UPLOAD_PRESIGN` to `RATE_LIMIT_PRESETS`
- `src/server/jobs/index.ts` — added `import "./file-processing"`
- `src/env.ts` — added Hetzner S3 + ClamAV env vars (server schema + runtimeEnv)
- `messages/en.json` — added `fileUpload` namespace (8 keys)
- `messages/ig.json` — added `fileUpload` namespace (Igbo translations)
- `.env.example` — added Hetzner S3 and ClamAV env var templates
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

## Change Log

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                     | Author            |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-02-25 | 1.0     | Implementation complete — all 15 tasks, 17 new files, 9 modified files, 712/712 tests passing (+45 new)                                                                                                                                                                                                                                                                         | claude-sonnet-4-6 |
| 2026-02-25 | 1.1     | Code review fixes — H1: verifyMagicBytes now checks declared vs detected MIME type (AC 3), H2: permanent error text → neutral hint + client-side size validation, M1: removed duplicate auth() in presign rate-limit key, M2: S3Client reuse in image variant uploads, L1: removed unused uniqueIndex import, L3: sanitizeFilename strips control chars. 716/716 tests (+4 new) | claude-opus-4-6   |
