"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScreeningResult } from "@igbo/db/schema/portal-job-postings";

interface FailedScreeningBadgeProps {
  screeningResult: ScreeningResult | null;
}

export function FailedScreeningBadge({ screeningResult }: FailedScreeningBadgeProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();

  if (!screeningResult) {
    return (
      <Badge
        variant="secondary"
        className="text-xs text-muted-foreground"
        data-testid="screening-badge-not-screened"
      >
        {t("notScreened")}
      </Badge>
    );
  }

  if (screeningResult.status === "pass") {
    return (
      <Badge
        variant="outline"
        className="border-green-500 text-green-700 text-xs"
        data-testid="screening-badge-pass"
      >
        {t("screeningPassBadge")}
      </Badge>
    );
  }

  const flagCount = screeningResult.flags.length;
  const isWarning = screeningResult.status === "warning";

  const label = isWarning ? t("screeningWarningBadge") : t("screeningFail");
  const badgeClass = isWarning
    ? "border-amber-500 text-amber-700 text-xs"
    : "border-red-500 text-red-700 text-xs";
  const testId = isWarning ? "screening-badge-warning" : "screening-badge-fail";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={badgeClass} data-testid={testId}>
            {label} ({t("flagCount", { count: flagCount })})
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {format.dateTime(new Date(screeningResult.checked_at), { dateStyle: "medium" })}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
