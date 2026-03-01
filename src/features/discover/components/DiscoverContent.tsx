"use client";

import { useState, useEffect } from "react";
import { DiscoverSearch } from "./DiscoverSearch";
import { MemberGrid } from "./MemberGrid";
import { GeoFallbackIndicator } from "./GeoFallbackIndicator";
import { useGeoFallback } from "../hooks/use-geo-fallback";
import type { DiscoverFilters, GeoFallbackLevel } from "../types";
import { DEFAULT_FILTERS } from "../types";

interface DiscoverContentProps {
  viewerProfile: {
    locationCity: string | null;
    locationState: string | null;
    locationCountry: string | null;
    interests: string[];
  } | null;
}

function computeFiltersForLevel(
  level: GeoFallbackLevel,
  location: { city?: string; state?: string; country?: string },
  baseFilters: DiscoverFilters,
): DiscoverFilters {
  return {
    ...baseFilters,
    locationCity: level === "city" ? (location.city ?? "") : "",
    locationState: level === "state" ? (location.state ?? "") : "",
    locationCountry: level === "country" ? (location.country ?? "") : "",
  };
}

export function DiscoverContent({ viewerProfile }: DiscoverContentProps) {
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [selectedLevel, setSelectedLevel] = useState<GeoFallbackLevel | null>(null);
  const [tooltipDismissed, setTooltipDismissed] = useState(() => {
    if (typeof window === "undefined") return true; // SSR: assume dismissed
    return localStorage.getItem("discover:fallback:tooltip-dismissed") === "true";
  });

  const viewerInterests = viewerProfile?.interests ?? [];

  const viewerLocation = {
    city: viewerProfile?.locationCity ?? undefined,
    state: viewerProfile?.locationState ?? undefined,
    country: viewerProfile?.locationCountry ?? undefined,
  };
  const hasViewerLocation = !!(
    viewerLocation.city ||
    viewerLocation.state ||
    viewerLocation.country
  );

  const { data: geoFallbackData } = useGeoFallback(
    hasViewerLocation ? viewerLocation : { city: undefined, state: undefined, country: undefined },
  );

  // Auto-set selectedLevel from activeLevel on first load
  useEffect(() => {
    if (geoFallbackData && selectedLevel === null) {
      setSelectedLevel(geoFallbackData.activeLevel);
      setFilters((prev) =>
        computeFiltersForLevel(geoFallbackData.activeLevel, viewerLocation, prev),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoFallbackData]);

  function handleLevelSelect(level: GeoFallbackLevel) {
    setSelectedLevel(level);
    setFilters((prev) => computeFiltersForLevel(level, viewerLocation, prev));
  }

  function handleTooltipDismiss() {
    localStorage.setItem("discover:fallback:tooltip-dismissed", "true");
    setTooltipDismissed(true);
  }

  const showTooltip =
    !tooltipDismissed && !!geoFallbackData && geoFallbackData.activeLevel !== "city";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Search / Filter sidebar */}
      <aside className="w-full lg:w-80 lg:flex-shrink-0">
        <DiscoverSearch
          filters={filters}
          onFiltersChange={setFilters}
          viewerProfile={viewerProfile}
        />
      </aside>

      {/* Results grid */}
      <main className="flex-1">
        {hasViewerLocation && geoFallbackData && selectedLevel && (
          <GeoFallbackIndicator
            levelCounts={geoFallbackData.levelCounts}
            activeLevel={geoFallbackData.activeLevel}
            selectedLevel={selectedLevel}
            locationLabels={viewerLocation}
            onLevelSelect={handleLevelSelect}
            showTooltip={showTooltip}
            onTooltipDismiss={handleTooltipDismiss}
          />
        )}
        <MemberGrid filters={filters} viewerInterests={viewerInterests} />
      </main>
    </div>
  );
}
