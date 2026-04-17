"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MatchScoreResult } from "@igbo/config";

interface MatchPillProps {
  matchScore: MatchScoreResult;
}

const TIER_CLASS: Record<Exclude<MatchScoreResult["tier"], "none">, string> = {
  strong: "", // uses Badge variant="success"
  good: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300",
  fair: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300",
};

/**
 * Compact badge showing a seeker's match percentage and tier for a job posting.
 *
 * Returns null when tier is "none" (score < 30) — suppressed per PRD FR47.
 */
export function MatchPill({ matchScore }: MatchPillProps) {
  const t = useTranslations("Portal.match");
  const { score, tier } = matchScore;

  if (tier === "none") return null;

  const tierLabel = t(tier);
  const ariaLabel = t("score", { score });

  if (tier === "strong") {
    return (
      <Badge variant="success" aria-label={ariaLabel} data-testid="match-pill" className="text-xs">
        {score}% · {tierLabel}
      </Badge>
    );
  }

  return (
    <Badge
      className={cn("text-xs", TIER_CLASS[tier])}
      aria-label={ariaLabel}
      data-testid="match-pill"
    >
      {score}% · {tierLabel}
    </Badge>
  );
}
