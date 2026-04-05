"use client";

import { useTranslations } from "next-intl";

interface SalaryRangeInputProps {
  min?: number | null;
  max?: number | null;
  competitiveOnly: boolean;
  onMinChange: (value: number | null) => void;
  onMaxChange: (value: number | null) => void;
  onCompetitiveOnlyChange: (checked: boolean) => void;
  errors?: {
    min?: string;
    max?: string;
  };
}

export function SalaryRangeInput({
  min,
  max,
  competitiveOnly,
  onMinChange,
  onMaxChange,
  onCompetitiveOnlyChange,
  errors,
}: SalaryRangeInputProps) {
  const t = useTranslations("Portal.salary");

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t("range")}</legend>

      {/* Competitive-only toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="salary-competitive-only"
          checked={competitiveOnly}
          onChange={(e) => onCompetitiveOnlyChange(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <label htmlFor="salary-competitive-only" className="text-sm text-muted-foreground">
          {t("preferNotToDisclose")}
        </label>
      </div>

      {/* Competitive label shown when toggle is checked */}
      {competitiveOnly && (
        <p className="text-sm font-medium text-muted-foreground">{t("competitive")}</p>
      )}

      {/* Min/max fields — hidden when competitive-only is checked */}
      {!competitiveOnly && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="salary-min" className="text-sm font-medium">
              {t("min")}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                ₦
              </span>
              <input
                id="salary-min"
                type="number"
                min={0}
                value={min ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onMinChange(val === "" ? null : Number(val));
                }}
                aria-describedby={errors?.min ? "salary-min-error" : undefined}
                className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {errors?.min && (
              <p id="salary-min-error" role="alert" className="text-xs text-destructive">
                {errors.min}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="salary-max" className="text-sm font-medium">
              {t("max")}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                ₦
              </span>
              <input
                id="salary-max"
                type="number"
                min={0}
                value={max ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onMaxChange(val === "" ? null : Number(val));
                }}
                aria-describedby={errors?.max ? "salary-max-error" : undefined}
                className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {errors?.max && (
              <p id="salary-max-error" role="alert" className="text-xs text-destructive">
                {errors.max}
              </p>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}

export function SalaryRangeInputSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-10 animate-pulse rounded bg-muted" />
        <div className="h-10 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
