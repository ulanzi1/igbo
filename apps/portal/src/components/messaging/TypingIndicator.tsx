"use client";

import { useTranslations } from "next-intl";

interface TypingIndicatorProps {
  /** Display name of the person typing */
  typingName?: string;
}

export function TypingIndicator({ typingName }: TypingIndicatorProps) {
  const t = useTranslations("Portal.messages");
  const label = typingName ? t("typing", { name: typingName }) : t("typingUnknown");

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-3 py-1 text-xs text-muted-foreground italic"
      data-testid="typing-indicator"
    >
      {label}
    </div>
  );
}
