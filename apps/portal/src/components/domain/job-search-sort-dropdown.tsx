"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { SortValue } from "@/hooks/use-job-search";

interface JobSearchSortDropdownProps {
  /** The sort value currently in the URL */
  requestedSort: SortValue;
  /** The sort the API actually used (may differ when empty query + relevance → date fallback) */
  effectiveSort: SortValue;
  onChange: (sort: SortValue) => void;
}

export function JobSearchSortDropdown({
  requestedSort,
  effectiveSort,
  onChange,
}: JobSearchSortDropdownProps) {
  const t = useTranslations("Portal.search");

  const sortOptions: { value: SortValue; label: string }[] = [
    { value: "relevance", label: t("sort.relevance") },
    { value: "date", label: t("sort.date") },
    { value: "salary_desc", label: t("sort.salary_desc") },
    { value: "salary_asc", label: t("sort.salary_asc") },
  ];

  const showFallbackNotice = requestedSort === "relevance" && effectiveSort === "date";

  return (
    <div className="flex flex-col gap-1" data-testid="sort-dropdown-wrapper">
      <div className="flex items-center gap-2">
        <Label htmlFor="sort-select" className="text-sm font-medium whitespace-nowrap">
          {t("sort.label")}
        </Label>
        {/*
          Bind the Select to `requestedSort` (the user's chosen value from the URL), NOT
          `effectiveSort`. When the API falls back (e.g. relevance → date on empty query),
          the existing `sortFallbackNotice` below explains the discrepancy. Binding to
          `effectiveSort` creates a click-loop where re-selecting the same option appears
          to do nothing because the Select's value snaps back to the fallback. (Review fix M3.)
        */}
        <Select value={requestedSort} onValueChange={(v) => onChange(v as SortValue)}>
          <SelectTrigger id="sort-select" className="w-44" data-testid="sort-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showFallbackNotice && (
        <div
          role="status"
          aria-label={t("sortFallbackNoticeAriaLabel")}
          data-testid="sort-fallback-notice"
          className="text-xs text-muted-foreground"
        >
          {t("sortFallbackNotice")}
        </div>
      )}
    </div>
  );
}
