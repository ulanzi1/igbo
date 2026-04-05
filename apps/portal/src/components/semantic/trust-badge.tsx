"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CommunityTrustSignals } from "@igbo/db/queries/cross-app";

interface TrustBadgeProps {
  trustSignals: CommunityTrustSignals;
}

const engagementPillClass: Record<CommunityTrustSignals["engagementLevel"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export function TrustBadge({ trustSignals }: TrustBadgeProps) {
  const t = useTranslations("Portal.trust");

  const memberYear = trustSignals.memberSince
    ? new Date(trustSignals.memberSince).getFullYear().toString()
    : null;

  const engagementLabelKey =
    trustSignals.engagementLevel === "high"
      ? "engagementHigh"
      : trustSignals.engagementLevel === "medium"
        ? "engagementMedium"
        : "engagementLow";

  return (
    <div className="flex flex-col gap-2" aria-label={t("communityTrust")}>
      {trustSignals.isVerified && (
        <div
          className="flex items-center gap-1 text-sm text-primary"
          aria-label={t("verifiedMember")}
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
          <span>{t("verifiedMember")}</span>
        </div>
      )}
      {memberYear && (
        <p className="text-sm text-muted-foreground">{t("memberSince", { year: memberYear })}</p>
      )}
      <span
        className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${engagementPillClass[trustSignals.engagementLevel]}`}
      >
        {t(engagementLabelKey)}
      </span>
    </div>
  );
}

export function TrustBadgeSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
    </div>
  );
}
