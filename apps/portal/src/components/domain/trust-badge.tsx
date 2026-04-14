"use client";

import { BadgeCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function TrustBadge() {
  const t = useTranslations("Portal.verification");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="border-green-500 text-green-700 text-xs gap-1 cursor-default"
            aria-label={t("badge")}
            data-testid="trust-badge"
          >
            <BadgeCheckIcon className="size-3" aria-hidden="true" />
            {t("badge")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{t("badgeTooltip")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
