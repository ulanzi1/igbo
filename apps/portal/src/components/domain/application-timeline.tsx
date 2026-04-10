"use client";

import React from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ApplicationTimelineProps {
  transitions: PortalApplicationTransition[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApplicationTimeline({ transitions }: ApplicationTimelineProps) {
  const t = useTranslations("Portal.ats");
  const format = useFormatter();

  if (transitions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("sidePanel.noTransitions")}</p>;
  }

  return (
    <ol
      className="relative flex flex-col gap-4 border-l border-border pl-4"
      aria-label={t("sidePanel.timeline")}
      data-testid="application-timeline"
    >
      {transitions.map((tr) => (
        <li key={tr.id} className="relative">
          <div
            className="absolute -left-[1.375rem] top-1 size-2.5 rounded-full bg-primary"
            aria-hidden="true"
          />
          <p className="text-sm font-medium capitalize">{tr.toStatus.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">
            {format.dateTime(tr.createdAt, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          {tr.reason && <p className="mt-0.5 text-xs text-muted-foreground italic">{tr.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
