"use client";

import { ImageAttachment } from "./ImageAttachment";
import { FileAttachment } from "./FileAttachment";
import type { ChatMessageAttachment } from "@/features/chat/types";

interface AttachmentGridProps {
  attachments: ChatMessageAttachment[];
}

/**
 * AttachmentGrid — renders message attachments.
 * Images display as a responsive grid; non-images as a vertical list of download cards.
 */
export function AttachmentGrid({ attachments }: AttachmentGridProps) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.fileType?.startsWith("image/"));
  const files = attachments.filter((a) => !a.fileType?.startsWith("image/"));

  return (
    <div className="mt-1 flex flex-col gap-1">
      {/* Image grid */}
      {images.length > 0 && (
        <div
          className={
            images.length === 1
              ? "flex"
              : "grid gap-1 " + (images.length === 2 ? "grid-cols-2" : "grid-cols-3")
          }
        >
          {images.map((img) => (
            <ImageAttachment
              key={img.id}
              fileUrl={img.fileUrl}
              fileName={img.fileName}
              fileSize={img.fileSize}
            />
          ))}
        </div>
      )}

      {/* File download cards */}
      {files.map((file) => (
        <FileAttachment
          key={file.id}
          fileUrl={file.fileUrl}
          fileName={file.fileName}
          fileType={file.fileType}
          fileSize={file.fileSize}
        />
      ))}
    </div>
  );
}
