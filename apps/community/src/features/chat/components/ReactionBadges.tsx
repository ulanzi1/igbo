"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface AggregatedReaction {
  emoji: string;
  count: number;
  hasOwnReaction: boolean;
}

interface ReactionBadgesProps {
  reactions: AggregatedReaction[];
  onToggle: (emoji: string) => void;
}

/**
 * ReactionBadges — renders emoji reaction pills beneath a message.
 * Own reactions are highlighted. Clicking toggles the reaction.
 */
export function ReactionBadges({ reactions, onToggle }: ReactionBadgesProps) {
  const t = useTranslations("Chat.reactions");

  if (reactions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reactions.map(({ emoji, count, hasOwnReaction }) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          aria-label={hasOwnReaction ? t("removeReaction") : t("reactionCount", { count })}
          aria-pressed={hasOwnReaction}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors",
            hasOwnReaction
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted text-foreground hover:bg-muted/70",
          )}
        >
          <span aria-hidden="true">{emoji}</span>
          <span className="text-xs tabular-nums">{count}</span>
        </button>
      ))}
    </div>
  );
}
