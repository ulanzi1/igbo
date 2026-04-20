"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getMatchHints, SKILLS_CHECKMARK_THRESHOLD } from "@/lib/get-match-hints";
import type { MatchScoreResult } from "@igbo/config";

interface MatchPillProps {
  matchScore: MatchScoreResult;
  onInfoClick?: () => void;
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
export function MatchPill({ matchScore, onInfoClick }: MatchPillProps) {
  const t = useTranslations("Portal.match");
  const { score, tier, signals } = matchScore;

  if (tier === "none") return null;

  const tierLabel = t(tier);
  const ariaLabel = t("score", { score });
  const hints = getMatchHints(signals);

  const badgeContent = (
    <>
      {tierLabel} · <span className="text-xs opacity-60">{score}%</span>
    </>
  );

  const badge =
    tier === "strong" ? (
      <Badge
        variant="success"
        aria-label={ariaLabel}
        data-testid="match-pill-badge"
        className="text-xs"
      >
        {badgeContent}
      </Badge>
    ) : (
      <Badge
        className={cn("text-xs", TIER_CLASS[tier])}
        aria-label={ariaLabel}
        data-testid="match-pill-badge"
      >
        {badgeContent}
      </Badge>
    );

  const skillsMatched = signals.skillsOverlap >= SKILLS_CHECKMARK_THRESHOLD;

  return (
    <div className="inline-flex items-center gap-1.5" data-testid="match-pill">
      {badge}
      <Popover
        onOpenChange={(open) => {
          if (open) onInfoClick?.();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex-shrink-0 inline-flex items-center justify-center min-w-[40px] min-h-[40px] p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label={t("infoLabel")}
            data-testid="match-info-trigger"
          >
            <Info size={16} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="max-w-[320px] w-[calc(100vw-2rem)]">
          {hints.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">{t("improveHeading")}</p>
              <ul className="text-sm space-y-1 mb-3">
                {hints.map((hint) => (
                  <li key={hint.signal}>• {t(hint.messageKey)}</li>
                ))}
              </ul>
              <Separator className="mb-3" />
            </>
          )}
          <p className="text-sm font-medium mb-2">{t("howItWorks")}</p>
          <ul className="text-sm space-y-1">
            <li>
              <span aria-hidden="true">{skillsMatched ? "✓" : "✗"}</span> {t("signalSkills")}
            </li>
            <li>
              <span aria-hidden="true">{signals.locationMatch ? "✓" : "✗"}</span>{" "}
              {t("signalLocation")}
            </li>
            <li>
              <span aria-hidden="true">{signals.employmentTypeMatch ? "✓" : "✗"}</span>{" "}
              {t("signalEmploymentType")}
            </li>
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
