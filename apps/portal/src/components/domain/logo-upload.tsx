"use client";

import * as React from "react";
import { Building2, Upload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface LogoUploadProps {
  currentLogoUrl?: string;
  onUploadComplete: (url: string) => void;
  onError?: (error: string) => void;
}

export function LogoUpload({ currentLogoUrl, onUploadComplete, onError }: LogoUploadProps) {
  const t = useTranslations("Portal.upload");
  const [isUploading, setIsUploading] = React.useState(false);
  const [preview, setPreview] = React.useState<string | undefined>(currentLogoUrl);
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const MAX_SIZE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(undefined);

    if (!ALLOWED_TYPES.includes(file.type)) {
      const msg = t("invalidType", { types: "JPEG, PNG, WebP, GIF" });
      setErrorMessage(msg);
      onError?.(msg);
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      const msg = t("tooLarge", { size: "5" });
      setErrorMessage(msg);
      onError?.(msg);
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/v1/upload/file", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody.detail ?? t("uploadFailed");
        setErrorMessage(msg);
        onError?.(msg);
        return;
      }

      const body = await res.json();
      const url = body.data.publicUrl as string;
      setPreview(url);
      onUploadComplete(url);
    } catch {
      const msg = t("uploadFailed");
      setErrorMessage(msg);
      onError?.(msg);
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label={isUploading ? t("uploading") : t("dragOrClick")}
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary disabled:pointer-events-none disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : preview ? (
          <img
            src={preview}
            alt={t("logoPreview")}
            className="h-full w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Building2 className="size-6 text-muted-foreground" />
            <Upload className="size-3 text-muted-foreground" />
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />
      {errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export function LogoUploadSkeleton() {
  return <div className="h-24 w-24 animate-pulse rounded-lg bg-muted" />;
}
