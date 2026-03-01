"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { UploadCategory } from "@/config/upload";
import { UPLOAD_CATEGORY_MIME_TYPES, UPLOAD_SIZE_LIMITS } from "@/config/upload";

interface FileUploadProps {
  category: UploadCategory;
  onUploadComplete: (fileUploadId: string, objectKey: string, publicUrl: string) => void;
  onError?: (error: string) => void;
  accept?: string; // e.g. "image/*" — fallback to UPLOAD_CATEGORY_MIME_TYPES[category]
  disabled?: boolean;
}

export function FileUpload({
  category,
  onUploadComplete,
  onError,
  accept,
  disabled,
}: FileUploadProps) {
  const t = useTranslations("fileUpload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">(
    "idle",
  );

  const acceptTypes = accept ?? UPLOAD_CATEGORY_MIME_TYPES[category].join(",");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size validation before making presign API call
    const sizeLimit = UPLOAD_SIZE_LIMITS[category];
    if (file.size > sizeLimit) {
      const maxSizeMbVal = Math.round(sizeLimit / (1024 * 1024));
      setStatus("error");
      onError?.(t("errorTooLarge", { maxSize: `${maxSizeMbVal}MB` }));
      return;
    }

    setStatus("uploading");
    setProgress(0);

    try {
      // Step 1: Get presigned URL
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
        const errBody = await presignRes.json().catch(() => ({}));
        const detail =
          typeof errBody?.detail === "string"
            ? errBody.detail
            : (errBody?.title ?? t("errorUploadFailed"));
        setStatus("error");
        onError?.(detail);
        return;
      }

      const { data: presignData } = await presignRes.json();
      const { uploadUrl, objectKey, fileUploadId } = presignData as {
        uploadUrl: string;
        objectKey: string;
        fileUploadId: string;
      };

      // Step 2: Upload directly to Hetzner via presigned URL (use XHR for progress)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      setProgress(100);
      setStatus("processing");

      // Step 3: Notify API of completion
      const confirmRes = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey }),
      });

      if (!confirmRes.ok) {
        setStatus("error");
        onError?.(t("errorUploadFailed"));
        return;
      }

      setStatus("done");
      // Derive public URL by stripping presigned query params from uploadUrl
      const publicUrl = uploadUrl.split("?")[0]!;
      onUploadComplete(fileUploadId, objectKey, publicUrl);
    } catch {
      setStatus("error");
      onError?.(t("errorUploadFailed"));
    } finally {
      // Reset input so same file can be re-selected if needed
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const maxSizeMb = Math.round(UPLOAD_SIZE_LIMITS[category] / (1024 * 1024));

  const isUploading = status === "uploading" || status === "processing";

  return (
    <div className="space-y-2">
      <label
        className={`inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors min-h-[36px] ${
          disabled || isUploading
            ? "cursor-not-allowed opacity-50 bg-muted"
            : "cursor-pointer bg-background hover:bg-accent"
        }`}
        aria-label={t("selectFile")}
      >
        <span>
          {status === "uploading"
            ? t("uploading")
            : status === "processing"
              ? t("processing")
              : t("selectFile")}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          disabled={disabled || isUploading}
          onChange={handleFileChange}
          className="hidden"
          aria-label={t("selectFile")}
        />
      </label>

      {status === "uploading" && progress !== null && (
        <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
      )}

      {status === "done" && <p className="text-xs text-muted-foreground">{t("uploadComplete")}</p>}

      {status === "error" && (
        <p className="text-xs text-destructive" role="alert">
          {t("errorUploadFailed")}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {t("maxSizeHint", { maxSize: `${maxSizeMb}MB` })}
      </p>
    </div>
  );
}
