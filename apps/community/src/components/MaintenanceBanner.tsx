"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceStatus } from "@/app/api/v1/maintenance-status/route";

/**
 * Pre-maintenance countdown banner.
 * Shown to all users when maintenance is scheduled but not yet active.
 * Uses React Query to poll GET /api/v1/maintenance-status every 60s.
 * Auto-dismisses when maintenance starts (middleware takes over with 503 page).
 */
export function MaintenanceBanner() {
  const t = useTranslations("Shell");
  const [countdown, setCountdown] = useState("");

  const { data: status } = useQuery<MaintenanceStatus | null>({
    queryKey: ["maintenance-status"],
    queryFn: async () => {
      const res = await fetch("/api/v1/maintenance-status");
      if (!res.ok) return null;
      const json = (await res.json()) as { data: MaintenanceStatus };
      return json.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Countdown timer — updates every second when scheduledStart is set
  useEffect(() => {
    if (!status?.scheduledStart || status.enabled) return;

    const scheduledAt = new Date(status.scheduledStart).getTime();

    function updateCountdown() {
      const remaining = scheduledAt - Date.now();
      if (remaining <= 0) {
        setCountdown("imminently");
        return;
      }
      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      const s = Math.floor((remaining % 60_000) / 1_000);
      if (h > 0) {
        setCountdown(`${h}h ${m}m`);
      } else if (m > 0) {
        setCountdown(`${m}m ${s}s`);
      } else {
        setCountdown(`${s}s`);
      }
    }

    const initTimer = setTimeout(updateCountdown, 0);
    const timer = setInterval(updateCountdown, 1_000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, [status]);

  // Don't show banner if:
  // - No status fetched yet or query returned null
  // - Maintenance is already enabled (middleware handles 503)
  // - No scheduled start
  // - Countdown not yet computed (timer hasn't fired)
  // - Start time passed (countdown = "imminently")
  if (!status || status.enabled || !status.scheduledStart || !countdown) return null;
  if (countdown === "imminently") return null;

  const durationText = status.expectedDuration
    ? t("maintenanceDuration", { minutes: status.expectedDuration })
    : "unknown";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <span>{t("maintenanceScheduled", { countdown, duration: durationText })}</span>
    </div>
  );
}
