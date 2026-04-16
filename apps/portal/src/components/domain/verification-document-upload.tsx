"use client";

import * as React from "react";
import { Upload, Loader2, X, FileIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export interface UploadedDocument {
  fileUploadId: string;
  objectKey: string;
  originalFilename: string;
}

interface VerificationDocumentUploadProps {
  onDocumentsChange: (docs: UploadedDocument[]) => void;
}

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;

export function VerificationDocumentUpload({ onDocumentsChange }: VerificationDocumentUploadProps) {
  const t = useTranslations("Portal.verification");
  const [documents, setDocuments] = React.useState<UploadedDocument[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(undefined);

    const remaining = MAX_FILES - documents.length;
    if (remaining <= 0) {
      setError(t("maxFiles"));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const toUpload = files.slice(0, remaining);

    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(t("invalidFileType"));
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(t("fileTooLarge"));
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    setUploading(true);
    try {
      const uploaded: UploadedDocument[] = [];
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/v1/upload/verification-document", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
          setError(errBody.detail ?? t("error"));
          return;
        }
        const body = (await res.json()) as { data: UploadedDocument };
        uploaded.push({
          fileUploadId: body.data.fileUploadId,
          objectKey: body.data.objectKey,
          originalFilename: body.data.originalFilename,
        });
      }
      const next = [...documents, ...uploaded];
      setDocuments(next);
      onDocumentsChange(next);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeDocument(fileUploadId: string) {
    const next = documents.filter((d) => d.fileUploadId !== fileUploadId);
    setDocuments(next);
    onDocumentsChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {documents.map((doc) => (
          <div
            key={doc.fileUploadId}
            className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm truncate">{doc.originalFilename}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${t("removeFile")}: ${doc.originalFilename}`}
              onClick={() => removeDocument(doc.fileUploadId)}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      {documents.length < MAX_FILES && (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="gap-2"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {t("uploadDocuments")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label={t("uploadDocuments")}
            onChange={handleFileChange}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("uploadHint")}</p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
