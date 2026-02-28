"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

const REACTION_EMOJIS = [
  "👍",
  "👎",
  "❤️",
  "😂",
  "😮",
  "😢",
  "😡",
  "🎉",
  "🔥",
  "💯",
  "👀",
  "🙏",
  "✅",
  "❌",
  "💪",
  "🤔",
  "😍",
  "🥳",
  "😎",
  "🤣",
  "😅",
  "🫡",
  "🫶",
  "🤝",
  "👏",
  "🙌",
  "💡",
  "⭐",
  "🚀",
  "💬",
] as const;

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

/**
 * ReactionPicker — curated set of ~30 common emoji for message reactions.
 */
export function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  const t = useTranslations("Chat.reactions");

  // Close on Escape key (WCAG 2.1 AA keyboard accessibility)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={t("react")}
      className="absolute z-10 flex flex-wrap gap-1 rounded-xl border border-border bg-background p-2 shadow-lg"
      style={{ bottom: "calc(100% + 8px)", left: 0, minWidth: "200px" }}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="rounded-md p-1 text-lg leading-none hover:bg-accent transition-colors"
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
