"use client";

import React, { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { AtsKanbanBoard } from "@/components/domain/ats-kanban-board";
import { ClosedApplicationsSection } from "@/components/domain/closed-applications-section";
import { CandidateSidePanel } from "@/components/domain/candidate-side-panel";
import type { KanbanApplication } from "@/components/domain/candidate-card";

// Defined locally to avoid importing server-only @igbo/db in a client component.
const APPLICATION_TERMINAL_STATES = ["hired", "rejected", "withdrawn"] as const;

export interface AtsPipelineViewProps {
  applications: KanbanApplication[];
}

/**
 * Client wrapper for the ATS pipeline view. Manages:
 * - Partition of applications into open (kanban) vs terminal (closed section)
 * - Side panel open/close state (selected application ID)
 * - Empty state rendering when there are no applications at all
 */
export function AtsPipelineView({ applications }: AtsPipelineViewProps) {
  const t = useTranslations("Portal.ats");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleCardClick = useCallback((applicationId: string) => {
    setSelectedId(applicationId);
  }, []);

  const handleSidePanelClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const terminal = new Set<string>(APPLICATION_TERMINAL_STATES);
  const openApps = applications.filter((app) => !terminal.has(app.status));
  const closedApps = applications.filter((app) => terminal.has(app.status));

  if (applications.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center"
        data-testid="ats-pipeline-empty"
      >
        <p className="text-lg font-semibold">{t("emptyBoard")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("emptyBoardDescription")}</p>
      </div>
    );
  }

  return (
    <>
      <AtsKanbanBoard applications={openApps} onCardClick={handleCardClick} />
      <ClosedApplicationsSection applications={closedApps} onCardClick={handleCardClick} />
      <CandidateSidePanel applicationId={selectedId} onClose={handleSidePanelClose} />
    </>
  );
}
