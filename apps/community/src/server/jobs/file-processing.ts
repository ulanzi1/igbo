import "server-only";
import { registerJob } from "@/server/jobs/job-runner";
import { eventBus } from "@/services/event-bus";
import { createScannerService, verifyMagicBytes } from "@/services/scanner-service";
import type { ScannerService } from "@/services/scanner-service";
import {
  findProcessingFileUploads,
  findPendingScanFileUploads,
  updateFileUpload,
} from "@/db/queries/file-uploads";
import type { PlatformFileUpload } from "@/db/queries/file-uploads";
import { fetchFileBuffer, deleteObject } from "@/services/file-upload-service";
import { env } from "@/env";
import { IMAGE_SRCSET_WIDTHS } from "@igbo/config/upload";

registerJob("file-processing", async () => {
  const scanner = createScannerService();
  const processing = await findProcessingFileUploads();
  const pendingScan = await findPendingScanFileUploads();
  for (const file of [...processing, ...pendingScan]) {
    await processFileRecord(file, scanner);
  }
});

export async function processFileRecord(
  file: PlatformFileUpload,
  scanner: ScannerService,
): Promise<void> {
  // 1. Fetch file bytes from Hetzner
  let buffer: Buffer;
  try {
    buffer = await fetchFileBuffer(file.objectKey);
  } catch {
    await updateFileUpload(file.id, { status: "quarantined" });
    eventBus.emit("file.quarantined", {
      fileUploadId: file.id,
      uploaderId: file.uploaderId,
      objectKey: file.objectKey,
      reason: "fetch_failed",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 2. Virus scan (ClamAV when enabled, no-op when disabled)
  try {
    const scanResult = await scanner.scan(file.objectKey, buffer);
    if (!scanResult.clean) {
      await deleteObject(file.objectKey);
      await updateFileUpload(file.id, { status: "quarantined" });
      eventBus.emit("file.quarantined", {
        fileUploadId: file.id,
        uploaderId: file.uploaderId,
        objectKey: file.objectKey,
        reason: scanResult.reason ?? "virus_detected",
        timestamp: new Date().toISOString(),
      });
      return;
    }
  } catch {
    // 3. ClamAV unreachable — mark pending_scan, do NOT quarantine; retry on next run
    // TODO: Sentry alert if consecutive ClamAV scan failures span more than 15 minutes
    await updateFileUpload(file.id, { status: "pending_scan" });
    return;
  }

  // 4. Magic byte verification (ALWAYS runs, regardless of scanner)
  // Pass declared MIME type to reject type mismatches (AC 3)
  const magicResult = await verifyMagicBytes(buffer, file.fileType ?? undefined);
  if (!magicResult.clean) {
    await deleteObject(file.objectKey);
    await updateFileUpload(file.id, { status: "quarantined" });
    eventBus.emit("file.quarantined", {
      fileUploadId: file.id,
      uploaderId: file.uploaderId,
      objectKey: file.objectKey,
      reason: magicResult.reason ?? "magic_byte_mismatch",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 5. Image optimization (if MIME type starts with image/)
  let processedUrl = `${env.HETZNER_S3_PUBLIC_URL}/${file.objectKey}`;

  if (file.fileType?.startsWith("image/")) {
    try {
      const sharp = (await import("sharp")).default;
      const { uploadObject } = await importUploadObject();

      // Generate srcset variants at 400/800/1200px (WebP)
      for (const width of IMAGE_SRCSET_WIDTHS) {
        const webpBuf = await sharp(buffer).resize(width).webp({ quality: 85 }).toBuffer();
        await uploadObject(`${file.objectKey}-${width}w.webp`, webpBuf, "image/webp");
      }

      // Generate AVIF primary at 1200px
      const avifBuf = await sharp(buffer).resize(1200).avif({ quality: 60 }).toBuffer();
      await uploadObject(`${file.objectKey}-1200.avif`, avifBuf, "image/avif");

      // processed_url points to the original; variants accessible by naming convention
      processedUrl = `${env.HETZNER_S3_PUBLIC_URL}/${file.objectKey}`;
      // TODO: Cloudflare cache warming — purge CDN cache after upload completes
    } catch {
      // If image optimization fails, still mark ready with original URL
    }
  }

  // 6. Update status to ready
  await updateFileUpload(file.id, { status: "ready", processedUrl });

  // 7. Emit file.processed event (emit is synchronous — no await)
  eventBus.emit("file.processed", {
    fileUploadId: file.id,
    uploaderId: file.uploaderId,
    objectKey: file.objectKey,
    processedUrl,
    timestamp: new Date().toISOString(),
  });
}

// Helper to upload a buffer to Hetzner — avoids circular import with file-upload-service
// S3Client is created once and reused across all variant uploads.
async function importUploadObject() {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const s3 = new S3Client({
    endpoint: env.HETZNER_S3_ENDPOINT,
    region: env.HETZNER_S3_REGION,
    credentials: {
      accessKeyId: env.HETZNER_S3_ACCESS_KEY_ID,
      secretAccessKey: env.HETZNER_S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    uploadObject: async (key: string, body: Buffer, contentType: string) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: env.HETZNER_S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  };
}
