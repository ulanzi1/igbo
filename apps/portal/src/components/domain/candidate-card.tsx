"use client";

import React, { forwardRef, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { ApplicationStatusBadge } from "@/components/domain/application-status-badge";
import { useDensity } from "@/providers/density-context";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

export interface KanbanApplication {
  id: string;
  seekerUserId: string;
  seekerName: string | null;
  seekerHeadline: string | null;
  seekerProfileId: string | null;
  seekerSkills: string[];
  status: PortalApplicationStatus;
  createdAt: Date | string;
  coverLetterText: string | null;
  portfolioLinksJson: string[];
  selectedCvId: string | null;
}

interface CandidateCardProps extends React.HTMLAttributes<HTMLDivElement> {
  application: KanbanApplication;
  onClick?: () => void;
  isDragging?: boolean;
  /** When true, renders the status badge inside the card (closed section context). */
  showStatusBadge?: boolean;
}

/**
 * Plain candidate card — does NOT call useSortable(). The sortable
 * wrapper (SortableCandidateCard) lives inside ats-kanban-board.tsx
 * and passes the ref + drag listeners/attributes directly to this
 * component so there is no intermediate wrapper div (which would
 * break the list/listitem a11y relationship).
 */
export const CandidateCard = forwardRef<HTMLDivElement, CandidateCardProps>(function CandidateCard(
  { application, onClick, isDragging = false, showStatusBadge = false, style, className, ...rest },
  ref,
) {
  const t = useTranslations("Portal.ats");
  const format = useFormatter();
  const { density } = useDensity();

  const createdAt =
    typeof application.createdAt === "string"
      ? new Date(application.createdAt)
      : application.createdAt;

  const formattedDate = format.dateTime(createdAt, { dateStyle: "medium" });
  const seekerName = application.seekerName ?? "—";
  const seekerHeadline = application.seekerHeadline ?? "";
  const ariaLabel = t("cardAriaLabel", {
    seekerName,
    seekerHeadline,
    date: formattedDate,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onClick) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  // Density-aware spacing
  const paddingClass = density === "dense" ? "p-2" : density === "compact" ? "p-2.5" : "p-3";
  const gapClass = density === "dense" ? "gap-1" : "gap-1.5";
  const textClass = density === "dense" ? "text-xs" : "text-sm";

  return (
    <div
      {...rest}
      ref={ref}
      style={style}
      role="listitem"
      tabIndex={0}
      aria-roledescription={t("cardRoleDescription")}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-slot="card"
      data-testid={`candidate-card-${application.id}`}
      data-dragging={isDragging}
      className={`bg-card text-card-foreground ${paddingClass} flex flex-col ${gapClass} cursor-pointer rounded-lg border border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${isDragging ? "opacity-40 shadow-lg" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium ${textClass}`}>{seekerName}</p>
        <span className="text-xs text-muted-foreground shrink-0" aria-hidden="true">
          {t("matchScorePlaceholder")}
        </span>
      </div>
      {seekerHeadline ? (
        <p className="text-xs text-muted-foreground line-clamp-2">{seekerHeadline}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("appliedOn", { date: formattedDate })}</p>
      {application.seekerSkills.length > 0 && density !== "dense" ? (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {application.seekerSkills.slice(0, 3).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-[10px] py-0 px-1.5">
              {skill}
            </Badge>
          ))}
        </div>
      ) : null}
      {showStatusBadge ? (
        <div className="mt-1">
          <ApplicationStatusBadge status={application.status} />
        </div>
      ) : null}
    </div>
  );
});
