import type { MemberCardData, GeoFallbackLevel } from "@/services/geo-search";

export type { MemberCardData, GeoFallbackLevel };

export interface DiscoverFilters {
  query: string;
  locationCity: string;
  locationState: string;
  locationCountry: string;
  interests: string[];
  language: string;
  membershipTier: "" | "BASIC" | "PROFESSIONAL" | "TOP_TIER";
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  query: "",
  locationCity: "",
  locationState: "",
  locationCountry: "",
  interests: [],
  language: "",
  membershipTier: "",
};
