"use client";

import { useRef, useState, useCallback, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { PendingUpload } from "@/hooks/use-file-attachment";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  isSending?: boolean;
  /** Called on every keystroke — throttling is handled by the caller */
  onTyping?: () => void;
  /** Called immediately when message is sent */
  onTypingStop?: () => void;
  /** Pending file uploads from useFileAttachment */
  pendingUploads?: PendingUpload[];
  /** Called when user selects files via the attachment button */
  onAddFiles?: (files: File[]) => void;
  /** Called when user removes a pending upload */
  onRemoveFile?: (tempId: string) => void;
  /** True while any upload is in progress */
  isUploading?: boolean;
}

export function MessageInput({
  onSend,
  disabled = false,
  isSending = false,
  onTyping,
  onTypingStop,
  pendingUploads = [],
  onAddFiles,
  onRemoveFile,
  isUploading = false,
}: MessageInputProps) {
  const t = useTranslations("Portal.messages");
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    requestAnimationFrame(resetHeight);
    onTyping?.();
  };

  const hasPendingDone = pendingUploads.some((u) => u.status === "done");

  const submit = useCallback(() => {
    const trimmed = value.trim();
    const canSubmitWithAttachmentsOnly =
      hasPendingDone && pendingUploads.length > 0 && !isUploading;
    if ((!trimmed && !canSubmitWithAttachmentsOnly) || disabled || isSending || isUploading) return;
    onTypingStop?.();
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  }, [
    value,
    disabled,
    isSending,
    onSend,
    onTypingStop,
    hasPendingDone,
    pendingUploads.length,
    isUploading,
  ]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      const messageLog = document.querySelector('[role="log"]');
      if (messageLog instanceof HTMLElement) {
        messageLog.focus();
      }
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0 && onAddFiles) {
      onAddFiles(files);
    }
    // Reset input so same file can be re-selected if removed
    e.target.value = "";
  };

  const isDisabled = disabled || isSending;
  const canSend = !isDisabled && !isUploading && (value.trim().length > 0 || hasPendingDone);

  return (
    <div className="flex flex-col border-t border-border bg-background">
      {/* Pending uploads list */}
      {pendingUploads.length > 0 && (
        <ul role="list" className="px-3 pt-2 flex flex-col gap-1">
          {pendingUploads.map((upload) => (
            <li key={upload.tempId} role="listitem" className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-muted-foreground" title={upload.fileName}>
                {upload.fileName}
              </span>
              {upload.status === "uploading" && (
                <span
                  role="progressbar"
                  aria-valuenow={upload.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("fileUploading")}
                  className="text-xs text-muted-foreground"
                >
                  {upload.progress}%
                </span>
              )}
              {upload.status === "error" && (
                <span className="text-xs text-destructive">{t("fileUploadFailed")}</span>
              )}
              {onRemoveFile && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(upload.tempId)}
                  aria-label={t("removeFile")}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 p-3">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Attachment button — hidden when disabled (read-only conversation) */}
        {!disabled && (
          <button
            type="button"
            onClick={handleAttachClick}
            aria-label={t("attachFile")}
            className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {/* Paperclip icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          aria-label={t("inputAriaLabel")}
          placeholder={t("inputPlaceholder")}
          rows={1}
          className={[
            "flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2",
            "text-sm leading-snug focus:outline-none focus:ring-2 focus:ring-ring",
            "placeholder:text-muted-foreground max-h-40 overflow-y-auto",
            isDisabled ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label={t("sendAriaLabel")}
          className={[
            "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            canSend
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          ].join(" ")}
        >
          {t("send")}
        </button>
      </div>
    </div>
  );
}
