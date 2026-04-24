"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AtsKanbanBoard } from "@/components/domain/ats-kanban-board";
import { ClosedApplicationsSection } from "@/components/domain/closed-applications-section";
import { CandidateSidePanel } from "@/components/domain/candidate-side-panel";
import { BulkActionToolbar } from "@/components/domain/bulk-action-toolbar";
import { MessagingDrawer } from "@/components/messaging/MessagingDrawer";
import type { KanbanApplication } from "@/components/domain/candidate-card";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

// Defined locally to avoid importing server-only @igbo/db in a client component.
const APPLICATION_TERMINAL_STATES = ["hired", "rejected", "withdrawn"] as const;

export interface AtsPipelineViewProps {
  applications: KanbanApplication[];
}

/**
 * Client wrapper for the ATS pipeline view. Manages:
 * - Partition of applications into open (kanban) vs terminal (closed section)
 * - Side panel open/close state (selected application ID)
 * - P-2.10 multi-select state (selectedIds) + bulk action toolbar
 * - Empty state rendering when there are no applications at all
 *
 * Selection state is lifted here (not in AtsKanbanBoard) so the toolbar
 * can live above the board and trigger a `router.refresh()` after a bulk
 * action to re-fetch applications from the server component parent.
 */
export function AtsPipelineView({ applications }: AtsPipelineViewProps) {
  const t = useTranslations("Portal.ats");
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [messagingAppId, setMessagingAppId] = useState<string | null>(null);
  const messagingTriggerRef = useRef<HTMLElement | null>(null);

  const handleCardClick = useCallback((applicationId: string) => {
    setSelectedId(applicationId);
  }, []);

  const handleSidePanelClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleOpenMessaging = useCallback((applicationId: string) => {
    // Remember the triggering card so focus can return after drawer closes (P6).
    const card = document.querySelector<HTMLElement>(
      `[data-testid="candidate-card-${applicationId}"]`,
    );
    messagingTriggerRef.current = card;
    // Close side panel first, then open messaging drawer after exit animation completes.
    // Delay (350ms) exceeds Sheet's 300ms exit animation to prevent simultaneous aria-modal Sheets (AC-10 / P7).
    setSelectedId(null);
    setTimeout(() => setMessagingAppId(applicationId), 350);
  }, []);

  const handleToggleSelect = useCallback((applicationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) {
        next.delete(applicationId);
      } else {
        next.add(applicationId);
      }
      return next;
    });
  }, []);

  const handleToggleColumnSelect = useCallback(
    (_status: PortalApplicationStatus, appIds: string[], checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          appIds.forEach((id) => next.add(id));
        } else {
          appIds.forEach((id) => next.delete(id));
        }
        return next;
      });
    },
    [],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkComplete = useCallback(() => {
    setSelectedIds(new Set());
    router.refresh();
  }, [router]);

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
      {selectedIds.size > 0 ? (
        <BulkActionToolbar
          selectedCount={selectedIds.size}
          applicationIds={Array.from(selectedIds)}
          onBulkComplete={handleBulkComplete}
          onClear={handleClearSelection}
        />
      ) : null}
      <AtsKanbanBoard
        applications={openApps}
        onCardClick={handleCardClick}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleColumnSelect={handleToggleColumnSelect}
        onClearSelection={handleClearSelection}
      />
      <ClosedApplicationsSection applications={closedApps} onCardClick={handleCardClick} />
      <CandidateSidePanel
        applicationId={selectedId}
        onClose={handleSidePanelClose}
        onOpenMessaging={handleOpenMessaging}
      />
      <MessagingDrawer
        applicationId={messagingAppId ?? ""}
        open={messagingAppId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMessagingAppId(null);
            messagingTriggerRef.current?.focus();
            messagingTriggerRef.current = null;
          }
        }}
        otherParticipantName={
          applications.find((app) => app.id === messagingAppId)?.seekerName ?? ""
        }
      />
    </>
  );
}
