"use client";

import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { INDUSTRY_OPTIONS } from "@/lib/validations/company";

interface CategoryCardProps {
  industry: string;
  count: number;
}

type KnownIndustry = (typeof INDUSTRY_OPTIONS)[number];

function isKnownIndustry(value: string): value is KnownIndustry {
  return (INDUSTRY_OPTIONS as readonly string[]).includes(value);
}

/**
 * Card displaying an industry category with a job count.
 * Links to the search page with the industry filter pre-applied.
 *
 * - Keyboard-accessible natively (rendered as <a>)
 * - aria-label combines industry label + count for assistive technology
 * - Industry label translated via Portal.industries.{key} when key is in INDUSTRY_OPTIONS
 */
export function CategoryCard({ industry, count }: CategoryCardProps) {
  const tDiscovery = useTranslations("Portal.discovery");
  const tIndustries = useTranslations("Portal.industries");
  const locale = useLocale();

  // Use typed namespace lookup for known industries (no type-cast hack);
  // fall back to the raw value for unknown industries (forward-compatible
  // with new INDUSTRY_OPTIONS entries that haven't been translated yet).
  const industryLabel = isKnownIndustry(industry) ? tIndustries(industry) : industry;

  const countLabel = tDiscovery("categoryJobCount", { count });
  const ariaLabel = `${industryLabel} — ${countLabel}`;

  return (
    <a
      href={`/${locale}/search?industry=${encodeURIComponent(industry)}`}
      aria-label={ariaLabel}
      className="block group"
    >
      <Card className="p-4 h-full flex flex-col gap-2 hover:border-primary hover:shadow-sm transition-all cursor-pointer">
        <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {industryLabel}
        </span>
        <span className="text-xs text-muted-foreground">{countLabel}</span>
      </Card>
    </a>
  );
}
