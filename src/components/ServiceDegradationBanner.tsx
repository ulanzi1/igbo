"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useServiceHealth } from "@/lib/service-health";

interface ServiceDegradationBannerProps {
  /** Context for the banner — renders appropriate message */
  context: "chat" | "video";
}

/**
 * Renders a dismissable info-style banner when a service is degraded.
 * - chat: shown on chat pages when chat namespace is unavailable
 * - video: shown when video/Daily.co is unavailable (disables join buttons)
 */
export function ServiceDegradationBanner({ context }: ServiceDegradationBannerProps) {
  const t = useTranslations("Shell");
  const { chatAvailable, videoAvailable } = useServiceHealth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (context === "chat" && chatAvailable) return null;
  if (context === "video" && videoAvailable) return null;

  const message = context === "chat" ? t("chatUnavailable") : t("videoUnavailable");

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}
