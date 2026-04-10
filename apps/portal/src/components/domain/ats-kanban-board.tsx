"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CandidateCard } from "@/components/domain/candidate-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KanbanApplicationStatus =
  | "submitted"
  | "under_review"
  | "shortlisted"
  | "interview"
  | "offered"
  | "hired"
  | "rejected"
  | "withdrawn";

export interface KanbanApplication {
  id: string;
  seekerName: string;
  seekerHeadline: string | null;
  status: KanbanApplicationStatus;
  seekerProfileId: string | null;
  seekerSkills: string[];
  createdAt: Date;
  coverLetterText: string | null;
  portfolioLinksJson: string[];
  selectedCvId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KANBAN_COLUMNS: KanbanApplicationStatus[] = [
  "submitted",
  "under_review",
  "shortlisted",
  "interview",
  "offered",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AtsKanbanBoardProps {
  applications: KanbanApplication[];
  onCardClick?: (applicationId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AtsKanbanBoard({ applications, onCardClick }: AtsKanbanBoardProps) {
  const t = useTranslations("Portal.ats");

  const columnLabels: Record<KanbanApplicationStatus, string> = {
    submitted: t("kanban.submitted"),
    under_review: t("kanban.under_review"),
    shortlisted: t("kanban.shortlisted"),
    interview: t("kanban.interview"),
    offered: t("kanban.offered"),
    hired: "",
    rejected: "",
    withdrawn: "",
  };

  return (
    <div data-testid="ats-kanban-board" className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((status) => {
        const columnApps = applications.filter((a) => a.status === status);
        return (
          <div
            key={status}
            data-testid={`kanban-column-${status}`}
            className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-lg bg-muted/40 p-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {columnLabels[status]}
              </h3>
              {columnApps.length > 0 && (
                <span className="text-xs text-muted-foreground/70">{columnApps.length}</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {columnApps.map((app) => (
                <div key={app.id} data-testid={`kanban-card-${app.id}`}>
                  <CandidateCard application={app} onClick={() => onCardClick?.(app.id)} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
