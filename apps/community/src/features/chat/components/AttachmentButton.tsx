"use client";

import { useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PaperclipIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttachmentButtonProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * AttachmentButton — paperclip icon button that opens a file picker.
 * Supports multiple file selection (up to 10 per message enforced in use-file-attachment).
 */
export function AttachmentButton({
  onFilesSelected,
  disabled = false,
  className,
}: AttachmentButtonProps) {
  const t = useTranslations("Chat.attachments");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input so the same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [onFilesSelected],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleChange}
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,application/pdf,audio/mpeg,audio/wav"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={t("attach")}
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md transition-colors",
          disabled
            ? "text-muted-foreground/50 cursor-not-allowed"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        <PaperclipIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </>
  );
}
