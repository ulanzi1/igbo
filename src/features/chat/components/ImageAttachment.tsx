"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";

interface ImageAttachmentProps {
  fileUrl: string;
  fileName: string;
  fileSize?: number | null;
}

/**
 * ImageAttachment — inline image preview with click-to-lightbox.
 * Lightbox traps focus, closes on Escape or backdrop click.
 */
export function ImageAttachment({ fileUrl, fileName, fileSize: _fileSize }: ImageAttachmentProps) {
  const t = useTranslations("Chat.attachments");
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      {/* Thumbnail */}
      <button
        type="button"
        onClick={handleOpen}
        className="block overflow-hidden rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={t("imagePreview")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={fileName}
          className="max-h-48 max-w-full rounded-md object-cover"
          loading="lazy"
        />
      </button>

      {/* Lightbox */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("imagePreview")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={handleClose}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("closeLightbox")}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40"
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={fileName}
            className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
