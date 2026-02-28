"use client";

import { useState, useCallback } from "react";
import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_SIZE_LIMITS,
  UPLOAD_CATEGORY_MIME_TYPES,
} from "@/config/upload";
import type { UploadCategory } from "@/config/upload";

export interface PendingUpload {
  tempId: string;
  file: File;
  fileName: string;
  status: "uploading" | "done" | "error";
  progress: number;
  errorMessage?: string;
}

export interface UploadedFileInfo extends PendingUpload {
  status: "done";
  fileUploadId: string;
}

type Upload = PendingUpload | UploadedFileInfo;

const MAX_ATTACHMENTS = 10;

function getUploadCategory(mimeType: string): UploadCategory {
  if (UPLOAD_CATEGORY_MIME_TYPES.image.includes(mimeType)) return "image";
  if (UPLOAD_CATEGORY_MIME_TYPES.video.includes(mimeType)) return "video";
  if (UPLOAD_CATEGORY_MIME_TYPES.audio.includes(mimeType)) return "audio";
  return "document";
}

function isUploadedFileInfo(u: Upload): u is UploadedFileInfo {
  return u.status === "done" && "fileUploadId" in u;
}

/**
 * useFileAttachment — orchestrates the presign → upload → confirm flow
 * using the existing /api/upload/presign and /api/upload/confirm endpoints.
 *
 * Returns pending uploads list, isUploading flag, addFiles, and removeFile helpers.
 */
export function useFileAttachment() {
  const [pendingUploads, setPendingUploads] = useState<Upload[]>([]);

  const addFiles = useCallback(
    async (files: File[]) => {
      // Limit to max 10 total (existing + new)
      const remaining = MAX_ATTACHMENTS - pendingUploads.length;
      if (remaining <= 0) return;
      const filesToUpload = files.slice(0, remaining);

      const newUploads: PendingUpload[] = filesToUpload.map((file) => ({
        tempId: crypto.randomUUID(),
        file,
        fileName: file.name,
        status: "uploading",
        progress: 0,
      }));

      setPendingUploads((prev) => [...prev, ...newUploads]);

      // Process all file uploads concurrently (each updates state independently)
      void Promise.all(newUploads.map((upload) => processUpload(upload, filesToUpload)));
    },
    [pendingUploads.length],
  );

  const processUpload = useCallback(async (upload: PendingUpload, _allFiles: File[]) => {
    const { tempId, file } = upload;

    // Validate file type
    const isAllowedType = (UPLOAD_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type);
    if (!isAllowedType) {
      setPendingUploads((prev) =>
        prev.map((u) =>
          u.tempId === tempId
            ? { ...u, status: "error" as const, errorMessage: "unsupportedType" }
            : u,
        ),
      );
      return;
    }

    // Validate file size
    const category = getUploadCategory(file.type);
    const sizeLimit = UPLOAD_SIZE_LIMITS[category];
    if (file.size > sizeLimit) {
      setPendingUploads((prev) =>
        prev.map((u) =>
          u.tempId === tempId
            ? { ...u, status: "error" as const, errorMessage: "fileTooLarge" }
            : u,
        ),
      );
      return;
    }

    try {
      // Step 1: Request presigned URL
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          category,
        }),
      });

      if (!presignRes.ok) {
        throw new Error("Failed to get upload URL");
      }

      const presignData = (await presignRes.json()) as {
        data: { uploadUrl: string; fileUploadId: string; objectKey: string };
      };
      const { uploadUrl, fileUploadId, objectKey } = presignData.data;

      // Step 2: Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error("Upload failed");
      }

      // Update progress to 80% after upload
      setPendingUploads((prev) =>
        prev.map((u) => (u.tempId === tempId ? { ...u, progress: 80 } : u)),
      );

      // Step 3: Confirm upload
      const confirmRes = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey }),
      });

      if (!confirmRes.ok) {
        throw new Error("Failed to confirm upload");
      }

      // Mark as done
      setPendingUploads((prev) =>
        prev.map((u) =>
          u.tempId === tempId
            ? ({ ...u, status: "done" as const, progress: 100, fileUploadId } as UploadedFileInfo)
            : u,
        ),
      );
    } catch {
      setPendingUploads((prev) =>
        prev.map((u) =>
          u.tempId === tempId
            ? { ...u, status: "error" as const, errorMessage: "uploadFailed" }
            : u,
        ),
      );
    }
  }, []);

  const removeFile = useCallback((tempId: string) => {
    setPendingUploads((prev) => prev.filter((u) => u.tempId !== tempId));
  }, []);

  const isUploading = pendingUploads.some((u) => u.status === "uploading");

  return {
    pendingUploads,
    isUploading,
    addFiles,
    removeFile,
  };
}
