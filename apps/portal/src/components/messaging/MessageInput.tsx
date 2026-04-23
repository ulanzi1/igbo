"use client";

import { useRef, useState, useCallback, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  isSending?: boolean;
}

export function MessageInput({ onSend, disabled = false, isSending = false }: MessageInputProps) {
  const t = useTranslations("Portal.messages");
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    requestAnimationFrame(resetHeight);
  };

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) return;
    onSend(trimmed);
    setValue("");
    // Reset height on next tick
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  }, [value, disabled, isSending, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    // F13: Escape focuses the message list (spec accessibility pattern)
    if (e.key === "Escape") {
      const messageLog = document.querySelector('[role="log"]');
      if (messageLog instanceof HTMLElement) {
        messageLog.focus();
      }
    }
  };

  const isDisabled = disabled || isSending;
  const canSend = value.trim().length > 0 && !isDisabled;

  return (
    <div className="flex items-end gap-2 p-3 border-t border-border bg-background">
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
  );
}
