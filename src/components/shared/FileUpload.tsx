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
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");

  const acceptTypes = accept ?? UPLOAD_CATEGORY_MIME_TYPES[category].join(",");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size validation
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
      // POST file to Next.js proxy route — server uploads to S3 (no browser CORS needed)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const { fileUploadId, objectKey, publicUrl } = await new Promise<{
        fileUploadId: string;
        objectKey: string;
        publicUrl: string;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload/file");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const body = JSON.parse(xhr.responseText) as {
              data: { fileUploadId: string; objectKey: string; publicUrl: string };
            };
            resolve(body.data);
          } else {
            let detail = t("errorUploadFailed");
            try {
              const errBody = JSON.parse(xhr.responseText) as {
                detail?: string;
                title?: string;
              };
              if (typeof errBody.detail === "string") detail = errBody.detail;
              else if (typeof errBody.title === "string") detail = errBody.title;
            } catch {
              // ignore
            }
            reject(new Error(detail));
          }
        };

        xhr.onerror = () => reject(new Error(t("errorUploadFailed")));
        xhr.send(formData);
      });

      setProgress(100);
      setStatus("done");
      onUploadComplete(fileUploadId, objectKey, publicUrl);
    } catch (err) {
      setStatus("error");
      onError?.(err instanceof Error ? err.message : t("errorUploadFailed"));
    } finally {
      // Reset input so same file can be re-selected if needed
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const maxSizeMb = Math.round(UPLOAD_SIZE_LIMITS[category] / (1024 * 1024));

  const isUploading = status === "uploading";

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
        <span>{status === "uploading" ? t("uploading") : t("selectFile")}</span>
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
