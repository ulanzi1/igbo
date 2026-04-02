"use client";

import { useTranslations } from "next-intl";
import type { GeoFallbackLevel, GeoFallbackLevelCounts } from "@/services/geo-search";

interface GeoFallbackIndicatorProps {
  levelCounts: GeoFallbackLevelCounts;
  activeLevel: GeoFallbackLevel;
  selectedLevel: GeoFallbackLevel; // user-selected level (may differ from activeLevel)
  locationLabels: {
    city?: string;
    state?: string;
    country?: string;
  };
  onLevelSelect: (level: GeoFallbackLevel) => void;
  showTooltip?: boolean; // Show onboarding tooltip
  onTooltipDismiss?: () => void;
}

interface RingConfig {
  level: GeoFallbackLevel;
  count: number;
  label: string;
}

export function GeoFallbackIndicator({
  levelCounts,
  activeLevel,
  selectedLevel,
  locationLabels,
  onLevelSelect,
  showTooltip = false,
  onTooltipDismiss,
}: GeoFallbackIndicatorProps) {
  const t = useTranslations("Discover.fallback");

  // Build ring configs for available levels
  const rings: RingConfig[] = [];

  if (levelCounts.city !== null) {
    rings.push({ level: "city", count: levelCounts.city, label: locationLabels.city ?? "" });
  }
  if (levelCounts.state !== null) {
    rings.push({ level: "state", count: levelCounts.state, label: locationLabels.state ?? "" });
  }
  if (levelCounts.country !== null) {
    rings.push({
      level: "country",
      count: levelCounts.country,
      label: locationLabels.country ?? "",
    });
  }
  // TODO(Story 3.x): region level between country and global
  rings.push({ level: "global", count: levelCounts.global, label: "" });

  // Determine next-level hint (one level above selected)
  const selectedIndex = rings.findIndex((r) => r.level === selectedLevel);
  const nextRing =
    selectedIndex >= 0 && selectedIndex < rings.length - 1 ? rings[selectedIndex + 1] : null;

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header message */}
      {activeLevel === "city" ? (
        <p className="mb-3 text-sm font-medium text-gray-900">
          {t("cityCount", { count: levelCounts.city!, location: locationLabels.city ?? "" })}
        </p>
      ) : (
        <p className="mb-3 text-sm font-medium text-amber-700">{t("cityGrowing")}</p>
      )}

      {/* Ring buttons — horizontal scope selector */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Geographic scope">
        {rings.map((ring, index) => {
          const isSelected = ring.level === selectedLevel;
          const ariaLabel =
            ring.level === "global"
              ? t("globalRingLabel", { count: ring.count })
              : t("ringLabel", { count: ring.count, location: ring.label });

          return (
            <button
              key={ring.level}
              type="button"
              aria-pressed={isSelected}
              aria-label={ariaLabel}
              onClick={() => onLevelSelect(ring.level)}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                "motion-safe:animate-fade-slide-in",
                isSelected
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50",
              ].join(" ")}
              style={{ animationDelay: `${index * 300}ms` }}
            >
              {ring.level === "global"
                ? t("globalCount", { count: ring.count })
                : ring.level === "city"
                  ? t("cityCount", { count: ring.count, location: ring.label })
                  : ring.level === "state"
                    ? t("stateCount", { count: ring.count, location: ring.label })
                    : t("countryCount", { count: ring.count, location: ring.label })}
            </button>
          );
        })}
      </div>

      {/* Next-level hint */}
      {nextRing && (
        <p className="mt-2 text-xs text-gray-500">
          {nextRing.level === "global"
            ? t("globalCount", { count: nextRing.count })
            : t("nextLevelHint", { count: nextRing.count, location: nextRing.label })}
        </p>
      )}

      {/* Onboarding tooltip */}
      {showTooltip && (
        <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <p>
            {t("tooltip", {
              level: t(
                activeLevel === "state"
                  ? "levelState"
                  : activeLevel === "country"
                    ? "levelCountry"
                    : "levelGlobal",
              ),
            })}
          </p>
          <button
            type="button"
            onClick={onTooltipDismiss}
            className="mt-2 text-xs font-medium text-blue-700 underline hover:no-underline"
          >
            {t("tooltipDismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
