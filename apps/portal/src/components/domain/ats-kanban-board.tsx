"use client";

import React, { useState, useCallback } from "react";
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
import { ApplicationStatusBadge } from "@/components/domain/application-status-badge";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KanbanApplication {
  id: string;
  seekerName: string;
  jobTitle: string;
  status: PortalApplicationStatus;
}

/**
 * Employer-facing kanban columns — the 5 non-terminal pipeline stages.
 * Terminal states (hired/rejected/withdrawn) are excluded from the board;
 * they are display-only in a separate section.
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
// Sortable Card (used inside SortableContext only)
// ---------------------------------------------------------------------------

interface SortableKanbanCardProps {
  application: KanbanApplication;
  cardRoleDescription: string;
}

function SortableKanbanCard({ application, cardRoleDescription }: SortableKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: "grab",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow"
      role="listitem"
      aria-roledescription={cardRoleDescription}
      data-testid={`kanban-card-${application.id}`}
    >
      <p className="text-sm font-medium">{application.seekerName}</p>
      <p className="text-xs text-muted-foreground">{application.jobTitle}</p>
      <div className="mt-1">
        <ApplicationStatusBadge status={application.status} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag Overlay Card (rendered outside SortableContext — no useSortable)
// F5 fix: separate component avoids calling useSortable outside context.
// F12 fix: no role="listitem" since overlay is portal-rendered outside list.
// ---------------------------------------------------------------------------

function DragOverlayCard({ application }: { application: KanbanApplication }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg" aria-hidden="true">
      <p className="text-sm font-medium">{application.seekerName}</p>
      <p className="text-xs text-muted-foreground">{application.jobTitle}</p>
      <div className="mt-1">
        <ApplicationStatusBadge status={application.status} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column (with useDroppable — F4 fix)
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  status: PortalApplicationStatus;
  applications: KanbanApplication[];
  isDropTarget: boolean;
  isInvalidTarget: boolean;
  cardRoleDescription: string;
}

function KanbanColumn({
  status,
  applications,
  isDropTarget,
  isInvalidTarget,
  cardRoleDescription,
}: KanbanColumnProps) {
  const t = useTranslations("Portal.applications");
  const { setNodeRef } = useDroppable({ id: status });

  const columnId = `kanban-col-list-${status}`;

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 flex-shrink-0 flex-col rounded-lg border p-2 ${
        isDropTarget
          ? "border-primary bg-primary/5"
          : isInvalidTarget
            ? "border-destructive/50 bg-destructive/5"
            : "border-border bg-muted/30"
      }`}
      data-testid={`kanban-column-${status}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold" id={columnId}>
          {t(`status.${status}`)}
        </h3>
        <span className="text-xs text-muted-foreground">{applications.length}</span>
      </div>
      <SortableContext items={applications.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-[48px]" role="list" aria-labelledby={columnId}>
          {applications.map((app) => (
            <SortableKanbanCard
              key={app.id}
              application={app}
              cardRoleDescription={cardRoleDescription}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface AtsKanbanBoardProps {
  applications: KanbanApplication[];
  /** Returns a promise so the board can rollback on failure (F3 fix). */
  onStatusChange?: (
    applicationId: string,
    from: PortalApplicationStatus,
    to: PortalApplicationStatus,
  ) => Promise<void>;
}

export function AtsKanbanBoard({ applications: initialApps, onStatusChange }: AtsKanbanBoardProps) {
  const t = useTranslations("Portal.applications");
  const [applications, setApplications] = useState<KanbanApplication[]>(initialApps);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropFeedback, setDropFeedback] = useState<{
    valid: PortalApplicationStatus[];
    invalid: PortalApplicationStatus[];
  }>({ valid: [], invalid: [] });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeApp = activeId ? applications.find((a) => a.id === activeId) : null;
  const cardRoleDescription = t("kanban.cardRoleDescription");

  const clearDragState = useCallback(() => {
    setActiveId(null);
    setDropFeedback({ valid: [], invalid: [] });
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      setActiveId(id);

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
    [applications],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      clearDragState();

      if (!over) return;

      const draggedApp = applications.find((a) => a.id === active.id);
      if (!draggedApp) return;

      // F4 fix: Determine target column safely.
      // over.id is either an application ID or a droppable column ID (PortalApplicationStatus).
      const overApp = applications.find((a) => a.id === over.id);
      const targetStatus: PortalApplicationStatus | undefined = overApp
        ? overApp.status
        : KANBAN_COLUMNS.includes(over.id as PortalApplicationStatus)
          ? (over.id as PortalApplicationStatus)
          : undefined;

      if (!targetStatus || targetStatus === draggedApp.status) return;
      if (!isValidDrop(draggedApp.status, targetStatus)) return;

      // F3 fix: Optimistic update with rollback on failure
      const previousApps = applications;
      setApplications((prev) =>
        prev.map((a) => (a.id === draggedApp.id ? { ...a, status: targetStatus } : a)),
      );

      onStatusChange?.(draggedApp.id, draggedApp.status, targetStatus)?.catch(() => {
        // Rollback on API failure
        setApplications(previousApps);
      });
    },
    [applications, onStatusChange, clearDragState],
  );

  // F10 fix: handle drag cancel (Escape key, pointer leaves window)
  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      clearDragState();
    },
    [clearDragState],
  );

  // Group applications by status
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
        aria-label={t("kanban.boardLabel")}
        data-testid="ats-kanban-board"
      >
        {columnData.map(({ status, applications: colApps }) => (
          <KanbanColumn
            key={status}
            status={status}
            applications={colApps}
            isDropTarget={dropFeedback.valid.includes(status)}
            isInvalidTarget={dropFeedback.invalid.includes(status)}
            cardRoleDescription={cardRoleDescription}
          />
        ))}
      </div>

      <DragOverlay>{activeApp ? <DragOverlayCard application={activeApp} /> : null}</DragOverlay>
    </DndContext>
  );
}
