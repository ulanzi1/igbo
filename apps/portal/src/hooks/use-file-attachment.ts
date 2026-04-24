"use client";

import { useState, useCallback } from "react";

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

const MAX_ATTACHMENTS = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed MIME types for message-category uploads (mirrors upload route)
const MESSAGE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

/**
 * useFileAttachment — portal-specific hook for message file uploads.
 * Uses XHR for upload progress tracking (fetch doesn't support upload progress).
 * Max 3 files, 10MB each, message-specific MIME types.
 */
export function useFileAttachment() {
  const [pendingUploads, setPendingUploads] = useState<Upload[]>([]);

  const processUpload = useCallback(async (upload: PendingUpload) => {
    const { tempId, file } = upload;

    // Validate file type
    if (!MESSAGE_ALLOWED_MIME_TYPES.has(file.type)) {
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
    if (file.size > MAX_FILE_SIZE) {
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
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "message");

      const fileUploadId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/v1/upload/file");

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
    async (files: File[]): Promise<string | undefined> => {
      const remaining = MAX_ATTACHMENTS - pendingUploads.length;
      if (remaining <= 0) {
        return "maxFilesReached";
      }

      const filesToUpload = files.slice(0, remaining);
      const overflow = files.length - filesToUpload.length;

      const newUploads: PendingUpload[] = filesToUpload.map((file) => ({
        tempId: crypto.randomUUID(),
        file,
        fileName: file.name,
        status: "uploading",
        progress: 0,
      }));

      setPendingUploads((prev) => [...prev, ...newUploads]);

      void Promise.all(newUploads.map((upload) => processUpload(upload)));

      // Return error key if some files were rejected due to limit
      return overflow > 0 ? "maxFilesReached" : undefined;
    },
    [pendingUploads.length, processUpload],
  );

  const removeFile = useCallback((tempId: string) => {
    setPendingUploads((prev) => prev.filter((u) => u.tempId !== tempId));
  }, []);

  const clearAll = useCallback(() => {
    setPendingUploads([]);
  }, []);

  const retryUpload = useCallback(
    async (tempId: string) => {
      const upload = pendingUploads.find((u) => u.tempId === tempId);
      if (!upload || upload.status !== "error") return;

      // Reset to uploading state
      setPendingUploads((prev) =>
        prev.map((u) =>
          u.tempId === tempId ? { ...u, status: "uploading" as const, progress: 0 } : u,
        ),
      );

      await processUpload({ ...upload, status: "uploading", progress: 0 });
    },
    [pendingUploads, processUpload],
  );

  const isUploading = pendingUploads.some((u) => u.status === "uploading");

  return {
    pendingUploads,
    isUploading,
    addFiles,
    removeFile,
    clearAll,
    retryUpload,
  };
}
