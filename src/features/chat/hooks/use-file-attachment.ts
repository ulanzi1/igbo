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

/**
 * useFileAttachment — uploads files via the /api/upload/file proxy route.
 * Returns pending uploads list, isUploading flag, addFiles, and removeFile helpers.
 */
export function useFileAttachment() {
  const [pendingUploads, setPendingUploads] = useState<Upload[]>([]);

  // processUpload must be declared before addFiles to satisfy the no-use-before-define rule
  const processUpload = useCallback(async (upload: PendingUpload) => {
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
      // POST file to Next.js proxy route — server uploads to S3 (no browser CORS needed)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const fileUploadId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload/file");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const p = Math.round((event.loaded / event.total) * 100);
            setPendingUploads((prev) =>
              prev.map((u) => (u.tempId === tempId ? { ...u, progress: p } : u)),
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const body = JSON.parse(xhr.responseText) as {
              data: { fileUploadId: string };
            };
            resolve(body.data.fileUploadId);
          } else {
            reject(new Error("Upload failed"));
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

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
      void Promise.all(newUploads.map((upload) => processUpload(upload)));
    },
    [pendingUploads.length, processUpload],
  );

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
