"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SeekerTrustSignals } from "@igbo/db/queries/cross-app";

interface TrustSignalsPanelProps {
  signals: SeekerTrustSignals;
}

const engagementPillClass: Record<SeekerTrustSignals["engagementLevel"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const badgePillClass: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const badgeLabelKey: Record<string, "badgeBlue" | "badgeRed" | "badgePurple"> = {
  blue: "badgeBlue",
  red: "badgeRed",
  purple: "badgePurple",
};

export function TrustSignalsPanel({ signals }: TrustSignalsPanelProps) {
  const trust = useTranslations("Portal.trust");
  const seeker = useTranslations("Portal.seeker");

  const memberYear = signals.memberSince
    ? new Date(signals.memberSince).getFullYear().toString()
    : "—";

  const engagementLabelKey =
    signals.engagementLevel === "high"
      ? "engagementHigh"
      : signals.engagementLevel === "medium"
        ? "engagementMedium"
        : "engagementLow";

  return (
    <section aria-labelledby="trust-heading" className="mt-6">
      <h2 id="trust-heading" className="mb-3 font-semibold">
        {seeker("trustSection")}
      </h2>
      <div className="flex flex-col gap-3">
        {signals.isVerified && (
          <div
            className="flex items-center gap-1 text-sm text-primary"
            aria-label={trust("verifiedMember")}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>{trust("verifiedMember")}</span>
          </div>
        )}

        {signals.memberSince && (
          <p className="text-sm text-muted-foreground">
            {trust("memberSince", { year: memberYear })}
          </p>
        )}

        <p className="text-sm">{trust("communityPoints", { points: signals.communityPoints })}</p>

        {signals.badgeType !== null && badgeLabelKey[signals.badgeType] && (
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgePillClass[signals.badgeType] ?? "bg-muted text-muted-foreground"}`}
          >
            {trust(badgeLabelKey[signals.badgeType]!)}
          </span>
        )}

        <span
          className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${engagementPillClass[signals.engagementLevel]}`}
        >
          {trust(engagementLabelKey)}
        </span>
      </div>
    </section>
  );
}

export function TrustSignalsPanelSkeleton() {
  return (
    <section className="mt-6">
      <div className="mb-3 h-5 w-36 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
      </div>
    </section>
  );
}
