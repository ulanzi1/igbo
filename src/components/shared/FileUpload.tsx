"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { UploadCategory } from "@/config/upload";
import { UPLOAD_CATEGORY_MIME_TYPES, UPLOAD_SIZE_LIMITS } from "@/config/upload";

interface FileUploadProps {
  category: UploadCategory;
  onUploadComplete: (fileUploadId: string, objectKey: string) => void;
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
      onUploadComplete(fileUploadId, objectKey);
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

  return (
    <div>
      <label style={{ cursor: disabled ? "not-allowed" : "pointer" }} aria-label={t("selectFile")}>
        <span>
          {status === "uploading"
            ? t("uploading")
            : status === "processing"
              ? t("processing")
              : t("dragAndDrop")}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          disabled={disabled || status === "uploading" || status === "processing"}
          onChange={handleFileChange}
          style={{ display: "none" }}
          aria-label={t("selectFile")}
        />
      </label>

      {status === "uploading" && progress !== null && (
        <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span>{progress}%</span>
        </div>
      )}

      {status === "done" && <p>{t("uploadComplete")}</p>}

      {status === "error" && <p role="alert">{t("errorUploadFailed")}</p>}

      <p>{t("maxSizeHint", { maxSize: `${maxSizeMb}MB` })}</p>
    </div>
  );
}
