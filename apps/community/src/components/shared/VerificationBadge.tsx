"use client";

import { ShieldCheck, BadgeCheck, Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { BADGE_MULTIPLIERS } from "@igbo/config/points";
import { cn } from "@/lib/utils";
import type { BadgeType } from "@/db/schema/community-badges";

type BadgeSize = "sm" | "md";

const BADGE_CONFIG = {
  blue: {
    Icon: ShieldCheck,
    colorClass: "text-blue-500",
  },
  red: {
    Icon: BadgeCheck,
    colorClass: "text-red-500",
  },
  purple: {
    Icon: Crown,
    colorClass: "text-purple-500",
  },
} as const;

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: "size-4",
  md: "size-5",
};

interface VerificationBadgeProps {
  badgeType: BadgeType | null | undefined;
  size?: BadgeSize;
}

export function VerificationBadge({ badgeType, size = "sm" }: VerificationBadgeProps) {
  const t = useTranslations("Badges");

  if (!badgeType) return null;

  const config = BADGE_CONFIG[badgeType];
  const { Icon, colorClass } = config;
  const level = t(badgeType);
  const multiplier = BADGE_MULTIPLIERS[badgeType];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label={t("ariaLabel", { level })} className="inline-flex items-center">
          <Icon className={cn(SIZE_CLASS[size], colorClass)} aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("tooltipLabel", { level, multiplier })}</TooltipContent>
    </Tooltip>
  );
}
