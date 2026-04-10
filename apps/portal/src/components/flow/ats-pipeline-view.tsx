"use client";

import React, { useState } from "react";
import { AtsKanbanBoard, type KanbanApplication } from "@/components/domain/ats-kanban-board";
import { ClosedApplicationsSection } from "@/components/domain/closed-applications-section";
import { CandidateSidePanel } from "@/components/domain/candidate-side-panel";
import { APPLICATION_TERMINAL_STATES } from "@igbo/db/schema/portal-applications";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AtsPipelineViewProps {
  applications: KanbanApplication[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AtsPipelineView({ applications }: AtsPipelineViewProps) {
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const terminalStates = new Set(APPLICATION_TERMINAL_STATES as readonly string[]);
  const activeApps = applications.filter((a) => !terminalStates.has(a.status));
  const closedApps = applications.filter((a) => terminalStates.has(a.status));

  return (
    <div data-testid="ats-pipeline-view">
      <AtsKanbanBoard applications={activeApps} onCardClick={setSelectedApplicationId} />

      {closedApps.length > 0 && (
        <div className="mt-6 px-2">
          <ClosedApplicationsSection
            applications={closedApps}
            onCardClick={setSelectedApplicationId}
          />
        </div>
      )}

      <CandidateSidePanel
        applicationId={selectedApplicationId}
        onClose={() => setSelectedApplicationId(null)}
      />
    </div>
  );
}
