"use client";

import { useTranslations, useFormatter } from "next-intl";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobSearchUrlState } from "@/lib/search-url-params";

interface ActiveFiltersBarProps {
  filters: JobSearchUrlState;
  onRemove: (key: keyof JobSearchUrlState, value?: string) => void;
  onClearAll: () => void;
}

interface FilterChip {
  key: keyof JobSearchUrlState;
  value?: string; // for multi-value fields
  label: string;
}

function tryTranslate(t: (key: string) => string, key: string, fallback: string): string {
  try {
    const result = t(key);
    return result;
  } catch {
    return fallback;
  }
}

export function ActiveFiltersBar({ filters, onRemove, onClearAll }: ActiveFiltersBarProps) {
  // Unconditional hook calls (Rules of Hooks)
  const tSearch = useTranslations("Portal.search");
  const tPosting = useTranslations("Portal.posting");
  const tCultural = useTranslations("Portal.culturalContext");
  const tIndustries = useTranslations("Portal.industries");
  const format = useFormatter();

  const chips: FilterChip[] = [];

  // Location
  for (const loc of filters.location) {
    chips.push({ key: "location", value: loc, label: loc });
  }

  // Employment type — translated
  for (const et of filters.employmentType) {
    const label = tryTranslate(tPosting, `type.${et}`, et);
    chips.push({ key: "employmentType", value: et, label });
  }

  // Industry — translated when key matches known industry
  for (const ind of filters.industry) {
    const label = tryTranslate(tIndustries, ind, ind);
    chips.push({ key: "industry", value: ind, label });
  }

  // Salary min — locale-aware number formatting via next-intl's useFormatter
  if (filters.salaryMin !== null) {
    chips.push({
      key: "salaryMin",
      label: tSearch("salary.chipMin", { amount: format.number(filters.salaryMin) }),
    });
  }

  // Salary max
  if (filters.salaryMax !== null) {
    chips.push({
      key: "salaryMax",
      label: tSearch("salary.chipMax", { amount: format.number(filters.salaryMax) }),
    });
  }

  // Remote
  if (filters.remote) {
    chips.push({ key: "remote", label: tSearch("remote.label") });
  }

  // Cultural context
  if (filters.culturalContextDiasporaFriendly) {
    chips.push({
      key: "culturalContextDiasporaFriendly",
      label: tCultural("badgeDiaspora"),
    });
  }
  if (filters.culturalContextIgboPreferred) {
    chips.push({
      key: "culturalContextIgboPreferred",
      label: tCultural("badgeIgbo"),
    });
  }
  if (filters.culturalContextCommunityReferred) {
    chips.push({
      key: "culturalContextCommunityReferred",
      label: tCultural("badgeCommunity"),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div
      data-testid="active-filters-bar"
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={tSearch("activeFiltersAriaLabel")}
    >
      {chips.map(({ key, value, label }) => {
        const chipKey = value !== undefined ? `${key}-${value}` : key;
        return (
          <button
            key={chipKey}
            type="button"
            onClick={() => onRemove(key, value)}
            aria-label={tSearch("removeFilterAriaLabel", { value: label })}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1",
              "text-xs font-medium bg-primary/10 text-primary",
              "border border-primary/20 hover:bg-primary/20 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-ring",
            )}
            data-testid={`filter-chip-${chipKey}`}
          >
            {label}
            <XIcon className="size-3 shrink-0" aria-hidden="true" />
          </button>
        );
      })}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        data-testid="clear-all-filters"
        className="text-xs h-7 px-2"
      >
        {tSearch("clearAll")}
      </Button>
    </div>
  );
}
