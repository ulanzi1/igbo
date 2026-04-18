"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResolveFlagModal } from "./resolve-flag-modal";
import type { PortalAdminFlag } from "@igbo/db/schema/portal-admin-flags";

interface FlagHistoryPanelProps {
  flags: PortalAdminFlag[];
  postingTitle: string;
}

function severityBadgeClass(severity: string): string {
  return (
    {
      high: "border-red-500 text-red-700",
      medium: "border-amber-500 text-amber-700",
      low: "border-blue-400 text-blue-700",
    }[severity as "high" | "medium" | "low"] ?? "border-gray-400 text-gray-700"
  );
}

function statusBadgeClass(status: string): string {
  return (
    {
      open: "border-orange-500 text-orange-700",
      resolved: "border-green-500 text-green-700",
      dismissed: "border-gray-400 text-gray-600",
    }[status as "open" | "resolved" | "dismissed"] ?? ""
  );
}

export function FlagHistoryPanel({ flags, postingTitle }: FlagHistoryPanelProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();
  const router = useRouter();
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  const openFlag = flags.find((f) => f.status === "open") ?? null;

  const formatDate = (d: Date | null) =>
    d ? format.dateTime(new Date(d), { dateStyle: "medium", timeStyle: "short" }) : "—";

  const statusLabel = (s: string) => {
    if (s === "open") return t("flagStatusOpen");
    if (s === "resolved") return t("flagStatusResolved");
    return t("flagStatusDismissed");
  };

  const categoryLabel = (c: string) => {
    const map: Record<string, string> = {
      misleading_content: t("categoryMisleadingContent"),
      discriminatory_language: t("categoryDiscriminatoryLanguage"),
      scam_fraud: t("categoryScamFraud"),
      terms_of_service_violation: t("categoryTermsOfServiceViolation"),
      other: t("categoryOther"),
    };
    return map[c] ?? c;
  };

  const severityLabel = (s: string) => {
    const map: Record<string, string> = {
      high: t("severityHigh"),
      medium: t("severityMedium"),
      low: t("severityLow"),
    };
    return map[s] ?? s;
  };

  const handleResolveClick = (flagId: string) => {
    setSelectedFlagId(flagId);
    setResolveModalOpen(true);
  };

  if (flags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="flag-history-empty">
        {t("flagHistoryEmpty")}
      </p>
    );
  }

  return (
    <section aria-label={t("flagHistory")} data-testid="flag-history-panel">
      <ol className="space-y-4" data-testid="flag-history-list">
        {flags.map((flag) => (
          <li
            key={flag.id}
            className="rounded-lg border border-border p-4 space-y-2"
            data-testid={`flag-item-${flag.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs ${severityBadgeClass(flag.severity)}`}
                aria-label={`${t("flagSeverity")}: ${severityLabel(flag.severity)}`}
                data-testid={`flag-severity-badge-${flag.id}`}
              >
                {severityLabel(flag.severity)}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs"
                data-testid={`flag-category-badge-${flag.id}`}
              >
                {categoryLabel(flag.category)}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs ${statusBadgeClass(flag.status)}`}
                data-testid={`flag-status-badge-${flag.id}`}
              >
                {statusLabel(flag.status)}
              </Badge>
              {flag.autoPaused && (
                <span
                  className="text-xs text-amber-700"
                  data-testid={`flag-auto-paused-${flag.id}`}
                >
                  {t("flagAutoPaused")}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(flag.createdAt)}
              </span>
            </div>

            <p className="text-sm" data-testid={`flag-description-${flag.id}`}>
              {flag.description}
            </p>

            {flag.status !== "open" && flag.resolutionNote && (
              <div
                className="rounded bg-muted px-3 py-2 space-y-1"
                data-testid={`flag-resolution-${flag.id}`}
              >
                <p className="text-xs font-medium text-muted-foreground">{t("flagResolution")}</p>
                <p className="text-sm">{flag.resolutionNote}</p>
                {flag.resolvedAt && (
                  <p className="text-xs text-muted-foreground">{formatDate(flag.resolvedAt)}</p>
                )}
              </div>
            )}

            {flag.status === "open" && (
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleResolveClick(flag.id)}
                  data-testid={`flag-resolve-btn-${flag.id}`}
                  aria-label={`${t("resolveFlag")} — ${postingTitle}`}
                >
                  {t("resolveFlag")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {selectedFlagId && (
        <ResolveFlagModal
          flagId={selectedFlagId}
          postingTitle={postingTitle}
          open={resolveModalOpen}
          onOpenChange={(open) => {
            setResolveModalOpen(open);
            if (!open) setSelectedFlagId(null);
          }}
          onSuccess={() => {
            setResolveModalOpen(false);
            setSelectedFlagId(null);
            router.refresh();
          }}
        />
      )}

      {/* Keep openFlag accessible for parent logic if needed */}
      {openFlag && <span aria-hidden="true" className="sr-only" data-testid="has-open-flag" />}
    </section>
  );
}

export function FlagHistoryPanelSkeleton() {
  return null;
}
