"use client";

import { SunIcon, EyeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContrastMode } from "@/hooks/use-contrast-mode";
import { cn } from "@/lib/utils";

/**
 * ContrastToggle — high contrast mode toggle button.
 *
 * The `useContrastMode` hook bootstraps the stored contrast preference
 * on mount, applying `data-contrast` on `<html>` via its own useEffect.
 * Positioned inline in the navigation bar (moved from layout.tsx in Story 1.3).
 */
function ContrastToggle({ className }: { className?: string }) {
  const { mode, toggle, isHighContrast } = useContrastMode();
  const t = useTranslations("Shell");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("contrastToggle")}
      aria-pressed={isHighContrast}
      data-contrast-mode={mode}
      className={cn(
        "relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-background text-foreground transition-all",
        "hover:bg-muted hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isHighContrast && "bg-primary text-primary-foreground border-primary",
        className,
      )}
    >
      {isHighContrast ? (
        <SunIcon className="size-5" aria-hidden="true" />
      ) : (
        <EyeIcon className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}

export { ContrastToggle };
