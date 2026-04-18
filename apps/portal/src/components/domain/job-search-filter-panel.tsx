"use client";

import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PORTAL_EMPLOYMENT_TYPES, SALARY_RANGE_BUCKETS } from "@/lib/validations/job-search";
import type { FacetValue, SalaryRangeFacet } from "@/lib/validations/job-search";
import { JobSearchSortDropdown } from "./job-search-sort-dropdown";
import type { JobSearchUrlState } from "@/lib/search-url-params";
import type { SortValue } from "@/hooks/use-job-search";

interface FilterFacets {
  location: FacetValue[];
  employmentType: FacetValue[];
  industry: FacetValue[];
  salaryRange: SalaryRangeFacet[];
}

interface JobSearchFilterPanelProps {
  facets: FilterFacets | null;
  filters: JobSearchUrlState;
  onChange: <K extends keyof JobSearchUrlState>(key: K, value: JobSearchUrlState[K]) => void;
  /** Sort controls — passed through so Sort by appears at top of filter column */
  requestedSort?: SortValue;
  effectiveSort?: SortValue;
  onSortChange?: (sort: SortValue) => void;
}

// Salary bucket bounds for click-to-filter
const BUCKET_BOUNDS: Record<string, { min?: number; max?: number; disabled?: boolean }> = {
  "<50k": { min: 0, max: 50000 },
  "50k-100k": { min: 50000, max: 100000 },
  "100k-200k": { min: 100000, max: 200000 },
  ">200k": { min: 200000 },
  competitive: { disabled: true },
};

export function JobSearchFilterPanel({
  facets,
  filters,
  onChange,
  requestedSort,
  effectiveSort,
  onSortChange,
}: JobSearchFilterPanelProps) {
  const t = useTranslations("Portal.search");
  const tPosting = useTranslations("Portal.posting");
  const tCultural = useTranslations("Portal.culturalContext");
  const tIndustries = useTranslations("Portal.industries");

  // Helpers
  function tryTranslate(translator: (k: string) => string, key: string, fallback: string): string {
    try {
      return translator(key);
    } catch {
      return fallback;
    }
  }

  function toggleArrayValue<T extends string>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  return (
    <section aria-label={t("filtersHeading")} className="space-y-5" data-testid="filter-panel">
      {/* Sort by — shown when sort props are provided */}
      {requestedSort && effectiveSort && onSortChange && (
        <>
          <JobSearchSortDropdown
            requestedSort={requestedSort}
            effectiveSort={effectiveSort}
            onChange={onSortChange}
          />
          <Separator />
        </>
      )}

      {/* Location */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("filterGroup.location")}</legend>
        {!facets || facets.location.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("facet.location.zero")}</p>
        ) : (
          <div className="space-y-1.5">
            {facets.location.map(({ value, count }) => {
              const isActive = filters.location.includes(value);
              return (
                <div
                  key={value}
                  className={cn("flex items-center gap-2", count === 0 && "opacity-50")}
                >
                  <Checkbox
                    id={`loc-${value}`}
                    checked={isActive}
                    onCheckedChange={() => {
                      onChange("location", toggleArrayValue(filters.location, value));
                    }}
                    aria-label={`${value} (${count})`}
                  />
                  <Label htmlFor={`loc-${value}`} className="text-sm cursor-pointer flex-1">
                    {value}
                    <span className="ml-1 text-muted-foreground text-xs">({count})</span>
                  </Label>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <Separator />

      {/* Employment Type */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("filterGroup.employmentType")}</legend>
        <div className="space-y-1.5">
          {PORTAL_EMPLOYMENT_TYPES.map((et) => {
            const facet = facets?.employmentType.find((f) => f.value === et);
            const count = facet?.count ?? 0;
            const isActive = filters.employmentType.includes(et);
            const label = tryTranslate(tPosting, `type.${et}`, et);
            return (
              <div
                key={et}
                className={cn("flex items-center gap-2", count === 0 && !isActive && "opacity-50")}
              >
                <Checkbox
                  id={`et-${et}`}
                  checked={isActive}
                  onCheckedChange={() => {
                    onChange("employmentType", toggleArrayValue(filters.employmentType, et));
                  }}
                  aria-label={`${label} (${count})`}
                />
                <Label htmlFor={`et-${et}`} className="text-sm cursor-pointer flex-1">
                  {label}
                  {facet && <span className="ml-1 text-muted-foreground text-xs">({count})</span>}
                </Label>
              </div>
            );
          })}
        </div>
      </fieldset>

      <Separator />

      {/* Industry */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("filterGroup.industry")}</legend>
        {facets && facets.industry.length > 0 ? (
          <div className="space-y-1.5">
            {facets.industry.map(({ value, count }) => {
              const isActive = filters.industry.includes(value);
              const label = tryTranslate(tIndustries, value, value);
              return (
                <div
                  key={value}
                  className={cn(
                    "flex items-center gap-2",
                    count === 0 && !isActive && "opacity-50",
                  )}
                >
                  <Checkbox
                    id={`ind-${value}`}
                    checked={isActive}
                    onCheckedChange={() => {
                      onChange("industry", toggleArrayValue(filters.industry, value));
                    }}
                    aria-label={`${label} (${count})`}
                  />
                  <Label htmlFor={`ind-${value}`} className="text-sm cursor-pointer flex-1">
                    {label}
                    <span className="ml-1 text-muted-foreground text-xs">({count})</span>
                  </Label>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">—</p>
        )}
      </fieldset>

      <Separator />

      {/* Salary Range */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("filterGroup.salary")}</legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="salary-min-filter" className="text-xs">
              {t("salary.min")}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground">
                ₦
              </span>
              <input
                id="salary-min-filter"
                type="number"
                min={0}
                value={filters.salaryMin ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onChange("salaryMin", val === "" ? null : parseInt(val, 10));
                }}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-6 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="salary-max-filter" className="text-xs">
              {t("salary.max")}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground">
                ₦
              </span>
              <input
                id="salary-max-filter"
                type="number"
                min={0}
                value={filters.salaryMax ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onChange("salaryMax", val === "" ? null : parseInt(val, 10));
                }}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-6 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                placeholder="Any"
              />
            </div>
          </div>
        </div>

        {/* Salary range bucket chips */}
        {facets && facets.salaryRange.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SALARY_RANGE_BUCKETS.map(({ key }) => {
              const facet = facets.salaryRange.find((f) => f.bucket === key);
              if (!facet) return null;
              const bounds = BUCKET_BOUNDS[key];
              const isDisabled = bounds?.disabled === true;
              const label = t(`salary.bucket.${key}`);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isDisabled}
                  title={isDisabled ? t("salary.competitiveTooltip") : undefined}
                  onClick={() => {
                    if (isDisabled || !bounds) return;
                    if (bounds.min !== undefined) onChange("salaryMin", bounds.min);
                    onChange("salaryMax", bounds.max ?? null);
                  }}
                  className={cn(
                    "inline-flex items-center rounded px-2 py-0.5 text-xs border",
                    isDisabled
                      ? "border-muted text-muted-foreground cursor-not-allowed opacity-60"
                      : "border-input hover:border-primary hover:text-primary cursor-pointer transition-colors",
                  )}
                  aria-disabled={isDisabled}
                  data-testid={`salary-bucket-${key}`}
                >
                  {label}
                  <span className="ml-1 text-muted-foreground">({facet.count})</span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <Separator />

      {/* Remote */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold sr-only">{t("filterGroup.remote")}</legend>
        <div className="flex items-center gap-3">
          <Switch
            id="remote-filter"
            checked={filters.remote}
            onCheckedChange={(checked) => onChange("remote", checked)}
            aria-label={t("remote.label")}
          />
          <Label htmlFor="remote-filter" className="text-sm cursor-pointer">
            {t("remote.label")}
          </Label>
        </div>
      </fieldset>

      <Separator />

      {/* Cultural Context */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("filterGroup.culturalContext")}</legend>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch
              id="cc-diaspora"
              checked={filters.culturalContextDiasporaFriendly}
              onCheckedChange={(checked) => onChange("culturalContextDiasporaFriendly", checked)}
              aria-label={tCultural("badgeDiaspora")}
            />
            <Label htmlFor="cc-diaspora" className="text-sm cursor-pointer">
              {tCultural("badgeDiaspora")}
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="cc-igbo"
              checked={filters.culturalContextIgboPreferred}
              onCheckedChange={(checked) => onChange("culturalContextIgboPreferred", checked)}
              aria-label={tCultural("badgeIgbo")}
            />
            <Label htmlFor="cc-igbo" className="text-sm cursor-pointer">
              {tCultural("badgeIgbo")}
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="cc-community"
              checked={filters.culturalContextCommunityReferred}
              onCheckedChange={(checked) => onChange("culturalContextCommunityReferred", checked)}
              aria-label={tCultural("badgeCommunity")}
            />
            <Label htmlFor="cc-community" className="text-sm cursor-pointer">
              {tCultural("badgeCommunity")}
            </Label>
          </div>
        </div>
      </fieldset>
    </section>
  );
}

/** Skeleton for the filter panel while the first response is loading */
export function JobSearchFilterPanelSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" data-testid="filter-panel-skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-28 bg-muted rounded" />
          {Array.from({ length: 3 }).map((__, j) => (
            <div key={j} className="flex items-center gap-2">
              <div className="size-4 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
