// ContentLanguageBadge — displays content language tag on articles/posts
// Used when articles feature ships (Story 6.1). Created here as a reusable primitive.
// The bilingual content authoring toggle (EN / IG / Both selection in the editor)
// is implemented in Story 6.1 when the rich text editor and articles feature ships.

import { cn } from "@/lib/utils";

type ContentLanguage = "en" | "ig" | "both";

const LABELS: Record<ContentLanguage, string> = {
  en: "EN",
  ig: "IG",
  both: "EN + IG",
};

function ContentLanguageBadge({
  language,
  ariaLabel,
  className,
}: {
  language: ContentLanguage;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        "bg-primary/10 text-primary",
        className,
      )}
      aria-label={ariaLabel}
    >
      {LABELS[language]}
    </span>
  );
}

export { ContentLanguageBadge };
export type { ContentLanguage };
