"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { CandidateCard } from "@/components/domain/candidate-card";
import type { KanbanApplication } from "@/components/domain/ats-kanban-board";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClosedApplicationsSectionProps {
  applications: KanbanApplication[];
  onCardClick?: (applicationId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClosedApplicationsSection({
  applications,
  onCardClick,
}: ClosedApplicationsSectionProps) {
  const t = useTranslations("Portal.ats");
  const [open, setOpen] = useState(false);

  if (applications.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="closed-applications-section">
      <div className="flex items-center justify-between py-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("closedSection")}</h2>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls="closed-apps-content"
            data-testid="closed-toggle"
          >
            {open ? (
              <>
                {t("closedSectionCollapse")}
                <ChevronUp className="ml-1 size-4" aria-hidden="true" />
              </>
            ) : (
              <>
                {t("closedSectionExpand", { count: applications.length })}
                <ChevronDown className="ml-1 size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent id="closed-apps-content">
        <ul
          className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={t("closedSection")}
          data-testid="closed-apps-list"
        >
          {applications.map((app) => (
            <li key={app.id}>
              <CandidateCard application={app} onClick={() => onCardClick?.(app.id)} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
