"use client";

import { SunIcon, EyeIcon } from "lucide-react";
import { useContrastMode } from "@/hooks/use-contrast-mode";
import { cn } from "@/lib/utils";

/**
 * ContrastToggle — high contrast mode toggle button.
 *
 * The `useContrastMode` hook bootstraps the stored contrast preference
 * on mount, applying `data-contrast` on `<html>` via its own useEffect.
 * This component is mounted in layout.tsx for this story and will be
 * moved to the navigation bar in Story 1.3.
 */
function ContrastToggle({ className }: { className?: string }) {
  const { mode, toggle, isHighContrast } = useContrastMode();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isHighContrast ? "Switch to default contrast" : "Switch to high contrast"}
      aria-pressed={isHighContrast}
      data-contrast-mode={mode}
      className={cn(
        "fixed bottom-4 right-4 z-50 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-background shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-foreground transition-all",
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
