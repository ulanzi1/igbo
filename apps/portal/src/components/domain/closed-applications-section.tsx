"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CandidateCard, type KanbanApplication } from "@/components/domain/candidate-card";

// Defined locally to avoid importing server-only @igbo/db in a client component.
const APPLICATION_TERMINAL_STATES = ["hired", "rejected", "withdrawn"] as const;

export interface ClosedApplicationsSectionProps {
  applications: KanbanApplication[];
  onCardClick?: (applicationId: string) => void;
}

/**
 * Terminal-state (hired/rejected/withdrawn) applications rendered
 * in a collapsible section below the main kanban board.
 *
 * Cards are NOT draggable because terminal states have no outbound
 * transitions per EMPLOYER_TRANSITIONS.
 */
export function ClosedApplicationsSection({
  applications,
  onCardClick,
}: ClosedApplicationsSectionProps) {
  const t = useTranslations("Portal.ats");
  const [isOpen, setIsOpen] = useState(false);

  // Filter to terminal-state applications only (defense-in-depth — parent
  // typically pre-filters but we double-check to honor the contract).
  const closedApps = applications.filter((app) =>
    (APPLICATION_TERMINAL_STATES as readonly string[]).includes(app.status),
  );

  if (closedApps.length === 0) {
    return null;
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-4 rounded-lg border border-border bg-muted/20 p-3"
      data-testid="closed-applications-section"
    >
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-2 text-left"
        data-testid="closed-applications-trigger"
      >
        <span className="flex items-center gap-2 font-semibold">
          {isOpen ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
          {isOpen
            ? t("closedSectionCollapse")
            : t("closedSectionExpand", { count: closedApps.length })}
        </span>
        <span className="text-xs text-muted-foreground">{t("closedSection")}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role="list"
          aria-label={t("closedSection")}
          className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {closedApps.map((app) => (
            <CandidateCard
              key={app.id}
              application={app}
              onClick={onCardClick ? () => onCardClick(app.id) : undefined}
              showStatusBadge
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
