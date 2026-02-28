"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { BoldIcon, ItalicIcon, StrikethroughIcon, CodeIcon, LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FormatSyntax = "bold" | "italic" | "strikethrough" | "code" | "link";

interface FormattingToolbarProps {
  /** Called when user clicks a formatting button with the syntax to apply */
  onFormat: (syntax: FormatSyntax) => void;
  className?: string;
}

/**
 * FormattingToolbar — renders markdown formatting action buttons.
 * Applies **bold**, *italic*, ~~strikethrough~~, `code`, [link](url) Markdown syntax.
 */
export function FormattingToolbar({ onFormat, className }: FormattingToolbarProps) {
  const t = useTranslations("Chat.richText");

  const handleClick = useCallback(
    (syntax: FormatSyntax) => (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onFormat(syntax);
    },
    [onFormat],
  );

  return (
    <div
      role="toolbar"
      aria-label={t("toggleToolbar")}
      className={cn(
        "flex items-center gap-1 px-3 py-1 border-b border-border bg-muted/30",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleClick("bold")}
        aria-label={t("bold")}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <BoldIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={handleClick("italic")}
        aria-label={t("italic")}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ItalicIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={handleClick("strikethrough")}
        aria-label={t("strikethrough")}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <StrikethroughIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={handleClick("code")}
        aria-label={t("code")}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <CodeIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={handleClick("link")}
        aria-label={t("link")}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <LinkIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
