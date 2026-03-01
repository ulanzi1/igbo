"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { TagInput } from "@/features/profiles/components/TagInput";
import type { DiscoverFilters } from "../types";
import { DEFAULT_FILTERS } from "../types";

interface DiscoverSearchProps {
  filters: DiscoverFilters;
  onFiltersChange: (filters: DiscoverFilters) => void;
  viewerProfile: {
    locationCity: string | null;
    locationCountry: string | null;
    interests: string[];
  } | null;
}

const TIER_OPTIONS = [
  { value: "" as const, labelKey: "tierAll" },
  { value: "BASIC" as const, labelKey: "tierBasic" },
  { value: "PROFESSIONAL" as const, labelKey: "tierProfessional" },
  { value: "TOP_TIER" as const, labelKey: "tierTopTier" },
];

export function DiscoverSearch({ filters, onFiltersChange, viewerProfile }: DiscoverSearchProps) {
  const t = useTranslations("Discover");

  // Text search is debounced 300ms
  const [searchInput, setSearchInput] = useState(filters.query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill location from viewerProfile on first render only
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (viewerProfile?.locationCity || viewerProfile?.locationCountry) {
      onFiltersChange({
        ...filters,
        locationCity: viewerProfile?.locationCity ?? "",
        locationCountry: viewerProfile?.locationCountry ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, query: value });
    }, 300);
  }

  function handleLocationChange(value: string) {
    onFiltersChange({ ...filters, locationCity: value });
  }

  function handleCountryChange(value: string) {
    onFiltersChange({ ...filters, locationCountry: value });
  }

  function handleInterestsChange(interests: string[]) {
    onFiltersChange({ ...filters, interests });
  }

  function handleLanguageChange(language: string) {
    onFiltersChange({ ...filters, language });
  }

  function handleTierChange(membershipTier: DiscoverFilters["membershipTier"]) {
    onFiltersChange({ ...filters, membershipTier });
  }

  function handleClearFilters() {
    setSearchInput("");
    onFiltersChange({
      ...DEFAULT_FILTERS,
      // Preserve location pre-filled from profile
      locationCity: viewerProfile?.locationCity ?? "",
      locationCountry: viewerProfile?.locationCountry ?? "",
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Text search */}
      <div className="flex flex-col gap-1">
        <label htmlFor="discover-search" className="text-sm font-medium text-gray-700">
          {t("filtersLabel")}
        </label>
        <input
          id="discover-search"
          type="search"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Location */}
      <div className="flex flex-col gap-1">
        <label htmlFor="discover-location" className="text-sm font-medium text-gray-700">
          {t("locationPlaceholder")}
        </label>
        <input
          id="discover-location"
          type="text"
          value={filters.locationCity}
          onChange={(e) => handleLocationChange(e.target.value)}
          placeholder={t("locationPlaceholder")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Country */}
      <div className="flex flex-col gap-1">
        <label htmlFor="discover-country" className="text-sm font-medium text-gray-700">
          {t("countryLabel")}
        </label>
        <input
          id="discover-country"
          type="text"
          value={filters.locationCountry}
          onChange={(e) => handleCountryChange(e.target.value)}
          placeholder={t("countryPlaceholder")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Interests multi-select */}
      <TagInput
        id="discover-interests"
        label={t("interestsLabel")}
        placeholder={t("interestsLabel")}
        values={filters.interests}
        onChange={handleInterestsChange}
      />

      {/* Language filter */}
      <div className="flex flex-col gap-1">
        <label htmlFor="discover-language" className="text-sm font-medium text-gray-700">
          {t("languageLabel")}
        </label>
        <select
          id="discover-language"
          value={filters.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">{t("allLanguages")}</option>
          <option value="Igbo">Igbo</option>
          <option value="English">English</option>
          <option value="Yoruba">Yoruba</option>
          <option value="Hausa">Hausa</option>
          <option value="Pidgin">Pidgin</option>
        </select>
      </div>

      {/* Tier filter */}
      <div className="flex flex-col gap-1">
        <label htmlFor="discover-tier" className="text-sm font-medium text-gray-700">
          {t("tierLabel")}
        </label>
        <select
          id="discover-tier"
          value={filters.membershipTier}
          onChange={(e) => handleTierChange(e.target.value as DiscoverFilters["membershipTier"])}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {TIER_OPTIONS.map(({ value, labelKey }) => (
            <option key={value} value={value}>
              {t(labelKey as Parameters<ReturnType<typeof useTranslations>>[0])}
            </option>
          ))}
        </select>
      </div>

      {/* Clear filters */}
      <button
        type="button"
        onClick={handleClearFilters}
        className="self-start text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
      >
        {t("clearFilters")}
      </button>
    </div>
  );
}
