"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "match_prompt_dismissed";

/**
 * Inline prompt shown to authenticated seekers who have no profile or have not
 * consented to matching. Dismissed once per session via sessionStorage.
 *
 * Follows the same hydration-safe pattern as GuestConversionBanner (P-4.4).
 */
export function CompleteProfilePrompt() {
  const t = useTranslations("Portal.match");
  const locale = useLocale();
  const [dismissed, setDismissed] = useState(true); // default true to avoid SSR flash

  // Hydration-safe sessionStorage check
  useEffect(() => {
    const isDismissed = sessionStorage.getItem(DISMISSED_KEY) === "true";
    setDismissed(isDismissed);
  }, []);

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-label={t("completeProfilePrompt")}
      data-testid="complete-profile-prompt"
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-foreground"
    >
      <span>
        {t("completeProfilePrompt")}{" "}
        <a
          href={`/${locale}/profile`}
          className="font-medium text-primary hover:underline"
          data-testid="complete-profile-link"
        >
          {t("completeProfileLink")}
        </a>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        aria-label={t("dismiss")}
        data-testid="dismiss-match-prompt"
        className="shrink-0 h-auto py-1 px-2"
      >
        <XIcon className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
