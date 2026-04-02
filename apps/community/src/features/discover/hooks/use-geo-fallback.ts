"use client";

import { useQuery } from "@tanstack/react-query";
import type { GeoFallbackSearchResult } from "@/services/geo-search";

interface GeoFallbackParams {
  city?: string;
  state?: string;
  country?: string;
}

function buildGeoFallbackUrl(params: GeoFallbackParams): string {
  const p = new URLSearchParams();
  if (params.city) p.set("city", params.city);
  if (params.state) p.set("state", params.state);
  if (params.country) p.set("country", params.country);
  const qs = p.toString();
  return qs ? `/api/v1/discover/geo-fallback?${qs}` : "/api/v1/discover/geo-fallback";
}

export function useGeoFallback(params: GeoFallbackParams) {
  const hasLocation = !!(params.city || params.state || params.country);
  return useQuery<GeoFallbackSearchResult>({
    queryKey: ["geo-fallback", params.city, params.state, params.country],
    queryFn: async () => {
      const url = buildGeoFallbackUrl(params);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load geo-fallback data");
      const json = (await res.json()) as { data: GeoFallbackSearchResult };
      return json.data;
    },
    enabled: hasLocation,
    staleTime: 5 * 60_000, // 5 min — level counts change slowly
  });
}
