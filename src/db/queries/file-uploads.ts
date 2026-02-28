// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformFileUploads } from "@/db/schema/file-uploads";

export type { PlatformFileUpload } from "@/db/schema/file-uploads";
import type { PlatformFileUpload } from "@/db/schema/file-uploads";

export async function createFileUpload(data: {
  uploaderId: string;
  objectKey: string;
  originalFilename?: string;
  fileType?: string;
  fileSize?: number;
}): Promise<PlatformFileUpload> {
  const [record] = await db
    .insert(platformFileUploads)
    .values({
      uploaderId: data.uploaderId,
      objectKey: data.objectKey,
      originalFilename: data.originalFilename,
      fileType: data.fileType,
      fileSize: data.fileSize,
    })
    .returning();
  if (!record) throw new Error("Insert returned no record");
  return record;
}

export async function getFileUploadByKey(objectKey: string): Promise<PlatformFileUpload | null> {
  const [record] = await db
    .select()
    .from(platformFileUploads)
    .where(eq(platformFileUploads.objectKey, objectKey))
    .limit(1);
  return record ?? null;
}

export async function getFileUploadById(id: string): Promise<PlatformFileUpload | null> {
  const [record] = await db
    .select()
    .from(platformFileUploads)
    .where(eq(platformFileUploads.id, id))
    .limit(1);
  return record ?? null;
}

export async function updateFileUpload(
  id: string,
  data: Partial<Pick<PlatformFileUpload, "status" | "processedUrl">>,
): Promise<void> {
  await db.update(platformFileUploads).set(data).where(eq(platformFileUploads.id, id));
}

export async function findProcessingFileUploads(): Promise<PlatformFileUpload[]> {
  return db.select().from(platformFileUploads).where(eq(platformFileUploads.status, "processing"));
}

export async function findPendingScanFileUploads(): Promise<PlatformFileUpload[]> {
  return db
    .select()
    .from(platformFileUploads)
    .where(eq(platformFileUploads.status, "pending_scan"));
}

export async function deleteFileUploadByKey(objectKey: string): Promise<void> {
  await db.delete(platformFileUploads).where(eq(platformFileUploads.objectKey, objectKey));
}
