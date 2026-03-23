"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";

interface Warning {
  id: string;
  reason: string;
  createdAt: string;
}

const DISMISSED_KEY = "obigbo-dismissed-warnings";

function getDismissedIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function addDismissedId(id: string): void {
  const ids = getDismissedIds();
  ids.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

interface WarningBannerProps {
  warnings: Warning[];
}

export function WarningBanner({ warnings }: WarningBannerProps) {
  const t = useTranslations("warnings.banner");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => getDismissedIds());

  const visible = useMemo(
    () => warnings.filter((w) => !dismissedIds.has(w.id)),
    [warnings, dismissedIds],
  );

  function dismiss(id: string) {
    addDismissedId(id);
    setDismissedIds((prev) => new Set([...prev, id]));
  }

  if (visible.length === 0) return null;

  return (
    <div role="alert" aria-live="polite">
      {visible.map((warning) => (
        <div
          key={warning.id}
          data-testid={`warning-banner-${warning.id}`}
          className="flex items-start justify-between gap-4 bg-amber-50 border-b border-amber-300 px-4 py-3 text-amber-900"
        >
          <div className="flex-1 text-sm">
            <span className="font-semibold mr-2">{t("title")}:</span>
            {t("reason", { reason: warning.reason })}
          </div>
          <button
            type="button"
            onClick={() => dismiss(warning.id)}
            className="shrink-0 rounded bg-amber-200 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-300"
          >
            {t("dismiss")}
          </button>
        </div>
      ))}
    </div>
  );
}
