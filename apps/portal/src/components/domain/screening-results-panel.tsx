"use client";

import { useTranslations, useFormatter } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ScreeningResult } from "@igbo/db/schema/portal-job-postings";

interface ScreeningResultsPanelProps {
  screeningResult: ScreeningResult | null;
}

function severityBadgeClass(severity: "low" | "medium" | "high"): string {
  return {
    high: "border-red-500 text-red-700",
    medium: "border-amber-500 text-amber-700",
    low: "border-blue-400 text-blue-700",
  }[severity];
}

export function ScreeningResultsPanel({ screeningResult }: ScreeningResultsPanelProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();

  if (!screeningResult) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="screening-not-screened">
        {t("screeningPlaceholder")}
      </p>
    );
  }

  const statusLabel = {
    pass: t("screeningPass"),
    warning: t("screeningWarning"),
    fail: t("screeningFail"),
  }[screeningResult.status];

  const statusClass = {
    pass: "text-green-700",
    warning: "text-amber-700",
    fail: "text-red-700",
  }[screeningResult.status];

  return (
    <div data-testid="screening-results-panel">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className={`text-sm font-medium ${statusClass}`} data-testid="screening-status-label">
          {statusLabel}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="screening-checked-at">
          {t("screeningCheckedAt", {
            date: format.dateTime(new Date(screeningResult.checked_at), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </span>
      </div>

      {screeningResult.flags.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="screening-no-flags">
          {t("screeningNoFlags")}
        </p>
      ) : (
        <Table aria-label={t("screeningFlags")} data-testid="screening-flags-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t("screeningRule")}</TableHead>
              <TableHead>{t("screeningSeverity")}</TableHead>
              <TableHead>{t("screeningField")}</TableHead>
              <TableHead>{t("screeningMatch")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {screeningResult.flags.map((flag, i) => (
              <TableRow key={`${flag.rule_id}-${i}`} data-testid={`flag-row-${i}`}>
                <TableCell className="text-sm">{flag.message}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-xs ${severityBadgeClass(flag.severity)}`}
                    data-testid={`flag-severity-${i}`}
                  >
                    {flag.severity === "high"
                      ? t("severityHigh")
                      : flag.severity === "medium"
                        ? t("severityMedium")
                        : t("severityLow")}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{flag.field ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                  {flag.match ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
