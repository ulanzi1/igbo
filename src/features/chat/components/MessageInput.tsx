"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { SendIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function MessageInput({ onSend, autoFocus = false, disabled = false }: MessageInputProps) {
  const t = useTranslations("Chat.input");
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setHasError(false);

    try {
      await onSend(trimmed);
      setContent("");
      // Auto-resize textarea back to default height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      setHasError(true);
    } finally {
      setIsSending(false);
    }
  }, [content, isSending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setHasError(false);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const canSend = content.trim().length > 0 && !isSending && !disabled;

  return (
    <div
      className={cn(
        "flex items-end gap-2 border-t border-border bg-background px-3 py-2",
        hasError && "bg-destructive/5",
      )}
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t("placeholder")}
        disabled={disabled || isSending}
        rows={1}
        aria-label={t("placeholder")}
        className={cn(
          "flex-1 resize-none rounded-md border bg-muted px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground",
          "focus:border-primary focus:ring-1 focus:ring-primary",
          hasError && "border-destructive focus:border-destructive focus:ring-destructive",
          "min-h-[40px] max-h-[120px]",
        )}
      />
      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={!canSend}
        aria-label={t("sendAriaLabel")}
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md transition-colors",
          canSend
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        <SendIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
