"use client";

import { useTranslations } from "next-intl";

interface TypingIndicatorProps {
  typingUserIds: string[];
  memberDisplayNameMap: Record<string, string>; // userId → displayName
}

export function TypingIndicator({ typingUserIds, memberDisplayNameMap }: TypingIndicatorProps) {
  const t = useTranslations("Chat.typing");

  if (typingUserIds.length === 0) return null;

  const names = typingUserIds.map((id) => memberDisplayNameMap[id] ?? t("unknownUser"));

  let label: string;
  if (names.length === 1) {
    label = t("userTyping", { name: names[0] });
  } else if (names.length === 2) {
    label = t("twoUsersTyping", { name1: names[0], name2: names[1] });
  } else {
    label = t("manyUsersTyping", { count: names.length });
  }

  return (
    <div
      className="flex items-center gap-1.5 px-4 py-1 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Animated dots — hidden when prefers-reduced-motion is set */}
      <span className="flex gap-0.5 motion-reduce:hidden" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
      </span>
      <span>{label}</span>
    </div>
  );
}
