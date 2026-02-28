"use client";

import { useTranslations } from "next-intl";
import { FileIcon, VideoIcon, FileTextIcon, Music2Icon } from "lucide-react";

interface FileAttachmentProps {
  fileUrl: string;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ fileType }: { fileType?: string | null }) {
  if (fileType?.startsWith("audio/")) {
    return <Music2Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />;
  }
  if (fileType?.startsWith("video/")) {
    return <VideoIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />;
  }
  if (fileType === "application/pdf") {
    return <FileTextIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />;
  }
  return <FileIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />;
}

/**
 * FileAttachment — download card for non-image files (documents, videos, etc.)
 */
export function FileAttachment({ fileUrl, fileName, fileType, fileSize }: FileAttachmentProps) {
  const t = useTranslations("Chat.attachments");

  return (
    <a
      href={fileUrl}
      download={fileName}
      rel="noopener noreferrer"
      aria-label={t("download")}
      className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-muted/70 transition-colors"
    >
      <FileTypeIcon fileType={fileType} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{fileName}</p>
        {fileSize ? (
          <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
        ) : null}
      </div>
    </a>
  );
}
