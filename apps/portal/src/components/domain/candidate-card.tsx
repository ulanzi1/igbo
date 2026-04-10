"use client";

import React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Card } from "@/components/ui/card";
import type { KanbanApplication } from "./ats-kanban-board";

interface CandidateCardProps {
  application: KanbanApplication;
  onClick: () => void;
  isDragging?: boolean;
}

export function CandidateCard({ application, onClick, isDragging = false }: CandidateCardProps) {
  const t = useTranslations("Portal.ats");
  const tApp = useTranslations("Portal.applications");
  const format = useFormatter();

  const appliedDate = format.dateTime(application.createdAt, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const ariaLabel = [
    application.seekerName,
    application.seekerHeadline,
    t("appliedOn", { date: appliedDate }),
  ]
    .filter(Boolean)
    .join(", ");

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <Card
      className={`p-3 cursor-pointer hover:shadow-md transition-shadow${isDragging ? " opacity-40 shadow-lg" : ""}`}
      aria-roledescription={tApp("kanban.cardRoleDescription")}
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      data-testid={`candidate-card-${application.id}`}
    >
      <p className="text-sm font-medium truncate">{application.seekerName}</p>
      {application.seekerHeadline && (
        <p className="text-xs text-muted-foreground truncate">{application.seekerHeadline}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{t("appliedOn", { date: appliedDate })}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("matchScorePlaceholder")}</p>
    </Card>
  );
}
