"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragCancelEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CandidateCard, type KanbanApplication } from "@/components/domain/candidate-card";
import { useDensity } from "@/providers/density-context";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

// Re-export KanbanApplication so existing imports from ats-kanban-board keep working
export type { KanbanApplication };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Employer-facing kanban columns — the 5 non-terminal pipeline stages.
 * Terminal states (hired/rejected/withdrawn) are excluded from the board;
 * they are display-only in the ClosedApplicationsSection.
 */
export const KANBAN_COLUMNS: PortalApplicationStatus[] = [
  "submitted",
  "under_review",
  "shortlisted",
  "interview",
  "offered",
];

/**
 * Allowed employer drag transitions.
 * Derived from VALID_TRANSITIONS in application-state-machine.ts,
 * filtered to employer-only actions (no withdrawn — that's seeker-initiated).
 *
 * WARNING: This map MUST stay in sync with the server-side VALID_TRANSITIONS.
 * A drift-guard test in ats-kanban-board.test.tsx validates this invariant.
 */
export const EMPLOYER_TRANSITIONS: Record<PortalApplicationStatus, PortalApplicationStatus[]> = {
  submitted: ["under_review", "rejected"],
  under_review: ["shortlisted", "rejected"],
  shortlisted: ["interview", "rejected"],
  interview: ["offered", "rejected"],
  offered: ["hired", "rejected"],
  // Terminal — cannot drag out
  hired: [],
  rejected: [],
  withdrawn: [],
};

export function isValidDrop(from: PortalApplicationStatus, to: PortalApplicationStatus): boolean {
  return EMPLOYER_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// SortableCandidateCard — useSortable wrapper around CandidateCard
// Stays inside SortableContext so @dnd-kit can register sortable items.
// Rendering is delegated to CandidateCard to keep the card reusable.
// ---------------------------------------------------------------------------

interface SortableCandidateCardProps {
  application: KanbanApplication;
  onClick?: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function SortableCandidateCard({
  application,
  onClick,
  isSelected,
  onToggleSelect,
}: SortableCandidateCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: "grab",
  };

  return (
    <CandidateCard
      ref={setNodeRef}
      application={application}
      onClick={onClick}
      isDragging={isDragging}
      isSelected={isSelected}
      onToggleSelect={onToggleSelect}
      style={style}
      data-kanban-card-id={application.id}
      {...attributes}
      {...listeners}
    />
  );
}

// ---------------------------------------------------------------------------
// Kanban Column
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  status: PortalApplicationStatus;
  applications: KanbanApplication[];
  isDropTarget: boolean;
  isInvalidTarget: boolean;
  onCardClick?: (applicationId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (applicationId: string) => void;
  onToggleColumnSelect?: (
    status: PortalApplicationStatus,
    appIds: string[],
    checked: boolean,
  ) => void;
}

function KanbanColumn({
  status,
  applications,
  isDropTarget,
  isInvalidTarget,
  onCardClick,
  selectedIds,
  onToggleSelect,
  onToggleColumnSelect,
}: KanbanColumnProps) {
  const tAts = useTranslations("Portal.ats");
  const { density } = useDensity();
  const { setNodeRef } = useDroppable({ id: status });

  const columnId = `kanban-col-list-${status}`;
  const statusLabel = tAts(`statusNames.${status}`);
  const gapClass = density === "dense" ? "gap-1" : density === "compact" ? "gap-1.5" : "gap-2";

  const columnAppIds = applications.map((a) => a.id);
  const selectedInColumn = selectedIds
    ? columnAppIds.filter((id) => selectedIds.has(id)).length
    : 0;
  const allSelected = columnAppIds.length > 0 && selectedInColumn === columnAppIds.length;
  const selectionEnabled = Boolean(onToggleSelect);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-lg border p-2 ${
        isDropTarget
          ? "border-primary bg-primary/5"
          : isInvalidTarget
            ? "border-destructive/50 bg-destructive/5"
            : "border-border bg-muted/30"
      }`}
      data-testid={`kanban-column-${status}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          {selectionEnabled && onToggleColumnSelect && columnAppIds.length > 0 ? (
            <Checkbox
              checked={allSelected}
              onCheckedChange={(next) => onToggleColumnSelect(status, columnAppIds, next === true)}
              aria-label={tAts("bulk.selectAllColumn", { status: statusLabel })}
              data-testid={`kanban-column-select-all-${status}`}
            />
          ) : null}
          <h3 className="text-sm font-semibold" id={columnId}>
            {statusLabel}
          </h3>
        </div>
        <Badge
          variant="secondary"
          aria-label={tAts("columnLabel", { status: statusLabel, count: applications.length })}
        >
          {tAts("columnCount", { count: applications.length })}
        </Badge>
      </div>
      <ScrollArea className="h-[calc(100vh-16rem)] min-h-[48px]">
        <SortableContext
          items={applications.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            className={`flex flex-col ${gapClass} min-h-[48px] pr-2`}
            role="list"
            aria-labelledby={columnId}
          >
            {applications.map((app) => (
              <SortableCandidateCard
                key={app.id}
                application={app}
                onClick={onCardClick ? () => onCardClick(app.id) : undefined}
                isSelected={selectedIds?.has(app.id) ?? false}
                onToggleSelect={onToggleSelect ? () => onToggleSelect(app.id) : undefined}
              />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface AtsKanbanBoardProps {
  applications: KanbanApplication[];
  /**
   * Optional hook called when a card is dropped on a valid target.
   * If omitted, the board defaults to calling PATCH /api/v1/applications/[id]/status.
   * Returning a rejected Promise triggers rollback + error toast.
   */
  onStatusChange?: (
    applicationId: string,
    from: PortalApplicationStatus,
    to: PortalApplicationStatus,
  ) => Promise<void>;
  /** Called when a card is clicked (opens the candidate side panel). */
  onCardClick?: (applicationId: string) => void;
  /** P-2.10: Multi-select. Pass undefined to disable selection UI entirely. */
  selectedIds?: Set<string>;
  onToggleSelect?: (applicationId: string) => void;
  onToggleColumnSelect?: (
    status: PortalApplicationStatus,
    appIds: string[],
    checked: boolean,
  ) => void;
  /** Called when a drag starts — used to clear any active selection. */
  onClearSelection?: () => void;
}

async function defaultStatusChange(
  applicationId: string,
  _from: PortalApplicationStatus,
  to: PortalApplicationStatus,
): Promise<void> {
  const res = await fetch(`/api/v1/applications/${applicationId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: to }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body?.title ?? "Status update failed") as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  }
}

export function AtsKanbanBoard({
  applications: initialApps,
  onStatusChange,
  onCardClick,
  selectedIds,
  onToggleSelect,
  onToggleColumnSelect,
  onClearSelection,
}: AtsKanbanBoardProps) {
  const tAts = useTranslations("Portal.ats");
  const [applications, setApplications] = useState<KanbanApplication[]>(initialApps);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropFeedback, setDropFeedback] = useState<{
    valid: PortalApplicationStatus[];
    invalid: PortalApplicationStatus[];
  }>({ valid: [], invalid: [] });

  // Sync external state (e.g., when parent refetches after a successful transition).
  useEffect(() => {
    setApplications(initialApps);
  }, [initialApps]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeApp = activeId ? applications.find((a) => a.id === activeId) : null;

  const clearDragState = useCallback(() => {
    setActiveId(null);
    setDropFeedback({ valid: [], invalid: [] });
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      setActiveId(id);
      // P-2.10: clear any multi-select selection when a drag begins
      onClearSelection?.();

      const app = applications.find((a) => a.id === id);
      if (app) {
        const validTargets = EMPLOYER_TRANSITIONS[app.status] ?? [];
        const invalidTargets = KANBAN_COLUMNS.filter(
          (col) => col !== app.status && !validTargets.includes(col),
        );
        setDropFeedback({
          valid: validTargets.filter((vt) => KANBAN_COLUMNS.includes(vt)),
          invalid: invalidTargets,
        });
      }
    },
    [applications, onClearSelection],
  );

  const formatValidStages = useCallback(
    (from: PortalApplicationStatus): string => {
      const targets = EMPLOYER_TRANSITIONS[from] ?? [];
      return targets.map((t) => tAts(`statusNames.${t}`)).join(", ");
    },
    [tAts],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      clearDragState();

      if (!over) return;

      const draggedApp = applications.find((a) => a.id === active.id);
      if (!draggedApp) return;

      const overApp = applications.find((a) => a.id === over.id);
      const targetStatus: PortalApplicationStatus | undefined = overApp
        ? overApp.status
        : KANBAN_COLUMNS.includes(over.id as PortalApplicationStatus)
          ? (over.id as PortalApplicationStatus)
          : undefined;

      if (!targetStatus || targetStatus === draggedApp.status) return;

      // Client-side pre-check: show invalid-transition toast BEFORE calling API
      if (!isValidDrop(draggedApp.status, targetStatus)) {
        toast.error(
          tAts("invalidTransition", {
            from: tAts(`statusNames.${draggedApp.status}`),
            to: tAts(`statusNames.${targetStatus}`),
            validStages: formatValidStages(draggedApp.status),
          }),
        );
        return;
      }

      // Optimistic update with rollback on failure
      const previousApps = applications;
      setApplications((prev) =>
        prev.map((a) => (a.id === draggedApp.id ? { ...a, status: targetStatus } : a)),
      );

      const changeFn = onStatusChange ?? defaultStatusChange;
      changeFn(draggedApp.id, draggedApp.status, targetStatus)
        .then(() => {
          toast.success(tAts("transitionSuccess", { status: tAts(`statusNames.${targetStatus}`) }));
        })
        .catch((err: unknown) => {
          // Rollback on API failure
          setApplications(previousApps);
          const errStatus = (err as { status?: number })?.status;
          if (errStatus === 409) {
            toast.error(
              tAts("invalidTransition", {
                from: tAts(`statusNames.${draggedApp.status}`),
                to: tAts(`statusNames.${targetStatus}`),
                validStages: formatValidStages(draggedApp.status),
              }),
            );
          } else {
            toast.error(tAts("transitionError"));
          }
        });
    },
    [applications, onStatusChange, clearDragState, tAts, formatValidStages],
  );

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      clearDragState();
    },
    [clearDragState],
  );

  // Group applications by status — terminal states are excluded from the board.
  const columnData = KANBAN_COLUMNS.map((status) => ({
    status,
    applications: applications.filter((a) => a.status === status),
  }));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className="flex gap-3 overflow-x-auto p-2"
        role="region"
        aria-label={tAts("ariaBoard")}
        data-testid="ats-kanban-board"
      >
        {columnData.map(({ status, applications: colApps }) => (
          <KanbanColumn
            key={status}
            status={status}
            applications={colApps}
            isDropTarget={dropFeedback.valid.includes(status)}
            isInvalidTarget={dropFeedback.invalid.includes(status)}
            onCardClick={onCardClick}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onToggleColumnSelect={onToggleColumnSelect}
          />
        ))}
      </div>

      <DragOverlay>
        {activeApp ? <CandidateCard application={activeApp} isDragging={true} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
