"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SeekerTrustSignals } from "@igbo/db/queries/cross-app";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TrustSignalsPanelProps {
  signals: SeekerTrustSignals;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrustSignalsPanel({ signals }: TrustSignalsPanelProps) {
  const t = useTranslations("Portal.trust");

  const memberYear = signals.memberSince
    ? new Date(signals.memberSince).getFullYear().toString()
    : null;

  const engagementLabelKey =
    signals.engagementLevel === "high"
      ? "engagementHigh"
      : signals.engagementLevel === "medium"
        ? "engagementMedium"
        : "engagementLow";

  return (
    <div className="flex flex-col gap-2" data-testid="trust-signals-panel">
      {signals.isVerified && (
        <div className="flex items-center gap-1 text-sm text-primary">
          <ShieldCheck className="size-4" aria-hidden="true" />
          <span>{t("verifiedMember")}</span>
        </div>
      )}
      {memberYear && (
        <p className="text-sm text-muted-foreground">{t("memberSince", { year: memberYear })}</p>
      )}
      <span className="text-xs text-muted-foreground">{t(engagementLabelKey)}</span>
      {signals.communityPoints > 0 && (
        <p className="text-sm text-muted-foreground">
          {signals.communityPoints} {t("points")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function TrustSignalsPanelSkeleton() {
  return (
    <div className="flex flex-col gap-2" data-testid="trust-signals-panel-skeleton">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}
