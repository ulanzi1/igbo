import "server-only";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";
import { ApiError } from "@/lib/api-error";
import { runJob } from "@/server/jobs/job-runner";
import { UPLOAD_CATEGORY_MIME_TYPES, UPLOAD_SIZE_LIMITS } from "@igbo/config/upload";
import type { UploadCategory } from "@igbo/config/upload";
import { createFileUpload, getFileUploadByKey } from "@igbo/db/queries/file-uploads";

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: env.HETZNER_S3_ENDPOINT,
    region: env.HETZNER_S3_REGION,
    credentials: {
      accessKeyId: env.HETZNER_S3_ACCESS_KEY_ID,
      secretAccessKey: env.HETZNER_S3_SECRET_ACCESS_KEY,
    },
    // All S3 operations are now server-side (browser uploads are proxied through Next.js).
    // Use path-style so the server connects to fsn1.your-objectstorage.com directly,
    // which is reliably accessible from within the Hetzner Docker environment.
    forcePathStyle: true,
    // Disable automatic CRC32 checksums — not supported by MinIO or Hetzner Object Storage
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function sanitizeFilename(filename: string): string {
  // Strip path separators, null bytes, and control characters; limit to 100 chars
  return filename.replace(/[/\\\0\x01-\x1f\x7f]/g, "_").slice(0, 100);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
  }
  return Buffer.concat(chunks);
}

export async function generatePresignedUploadUrl(params: {
  uploaderId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  category: UploadCategory;
}): Promise<{ uploadUrl: string; objectKey: string; fileUploadId: string }> {
  const { uploaderId, filename, mimeType, sizeBytes, category } = params;

  const allowedMimes = UPLOAD_CATEGORY_MIME_TYPES[category];
  if (!allowedMimes.includes(mimeType)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `File type '${mimeType}' is not allowed for category '${category}'`,
    });
  }

  const sizeLimit = UPLOAD_SIZE_LIMITS[category];
  if (sizeBytes > sizeLimit) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `File size exceeds the maximum allowed size of ${sizeLimit} bytes for category '${category}'`,
    });
  }

  const objectKey = `uploads/${uploaderId}/${randomUUID()}-${sanitizeFilename(filename)}`;

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.HETZNER_S3_BUCKET,
    Key: objectKey,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });

  // ContentLength in the signed command creates a signature condition;
  // S3 rejects uploads with mismatched size (prevents bait-and-switch per AC 1)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  const record = await createFileUpload({
    uploaderId,
    objectKey,
    originalFilename: filename,
    fileType: mimeType,
    fileSize: sizeBytes,
  });

  return { uploadUrl, objectKey, fileUploadId: record.id };
}

/**
 * Proxy upload: browser posts the file to Next.js, which streams it to S3.
 * Eliminates the need for browser-to-S3 direct uploads (and all CORS issues).
 */
export async function proxyUpload(params: {
  uploaderId: string;
  file: File;
  category: UploadCategory;
}): Promise<{ fileUploadId: string; objectKey: string; publicUrl: string }> {
  const { uploaderId, file, category } = params;

  const allowedMimes = UPLOAD_CATEGORY_MIME_TYPES[category];
  if (!allowedMimes.includes(file.type)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `File type '${file.type}' is not allowed for category '${category}'`,
    });
  }

  const sizeLimit = UPLOAD_SIZE_LIMITS[category];
  if (file.size > sizeLimit) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `File size exceeds the maximum allowed size of ${sizeLimit} bytes for category '${category}'`,
    });
  }

  const objectKey = `uploads/${uploaderId}/${randomUUID()}-${sanitizeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const s3Client = getS3Client();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.HETZNER_S3_BUCKET,
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
      ContentLength: buffer.byteLength,
    }),
  );

  const record = await createFileUpload({
    uploaderId,
    objectKey,
    originalFilename: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  await runJob("file-processing");

  const publicUrl = `${env.HETZNER_S3_PUBLIC_URL}/${objectKey}`;
  return { fileUploadId: record.id, objectKey, publicUrl };
}

export async function confirmUpload(objectKey: string, authenticatedUserId: string): Promise<void> {
  const record = await getFileUploadByKey(objectKey);
  if (!record) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Upload record not found" });
  }
  if (record.uploaderId !== authenticatedUserId) {
    throw new ApiError({ title: "Forbidden", status: 403, detail: "You do not own this upload" });
  }
  // TODO: Epic 12 infrastructure story should add a periodic cron trigger (e.g., every 5 min)
  // for runAllDueJobs() to ensure pending_scan files are retried
  await runJob("file-processing");
}

export async function fetchFileBuffer(objectKey: string): Promise<Buffer> {
  const s3Client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.HETZNER_S3_BUCKET,
    Key: objectKey,
  });
  const response = await s3Client.send(command);
  const body = response.Body;
  if (!body) {
    throw new Error(`Empty body for object key: ${objectKey}`);
  }
  return streamToBuffer(body as Readable);
}

export async function deleteObject(objectKey: string): Promise<void> {
  const s3Client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: env.HETZNER_S3_BUCKET,
    Key: objectKey,
  });
  await s3Client.send(command);
}
