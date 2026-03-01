"use client";

import { useState } from "react";
import { DiscoverSearch } from "./DiscoverSearch";
import { MemberGrid } from "./MemberGrid";
import type { DiscoverFilters } from "../types";
import { DEFAULT_FILTERS } from "../types";

interface DiscoverContentProps {
  viewerProfile: {
    locationCity: string | null;
    locationCountry: string | null;
    interests: string[];
  } | null;
}

export function DiscoverContent({ viewerProfile }: DiscoverContentProps) {
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);

  const viewerInterests = viewerProfile?.interests ?? [];

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
        <MemberGrid filters={filters} viewerInterests={viewerInterests} />
      </main>
    </div>
  );
}
