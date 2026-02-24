"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Country, State } from "country-state-city";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveProfileAction,
  type SaveProfileInput,
  ProfilePhotoUpload,
  TagInput,
} from "@/features/profiles";

const ALL_COUNTRIES = Country.getAllCountries().sort((a, b) => a.name.localeCompare(b.name));

interface Props {
  defaultDisplayName: string;
  defaultLocationCity: string;
  defaultLocationState: string;
  defaultLocationCountry: string;
  onComplete: () => void;
}

export function ProfileStep({
  defaultDisplayName,
  defaultLocationCity,
  defaultLocationState,
  defaultLocationCountry,
  onComplete,
}: Props) {
  const t = useTranslations("Onboarding.profile");

  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [locationCity, setLocationCity] = useState(defaultLocationCity);
  const [locationState, setLocationState] = useState(defaultLocationState);
  const [locationCountry, setLocationCountry] = useState(defaultLocationCountry);

  const countryIsoCode = useMemo(
    () => ALL_COUNTRIES.find((c) => c.name === locationCountry)?.isoCode ?? "",
    [locationCountry],
  );

  const stateOptions = useMemo(
    () => (countryIsoCode ? State.getStatesOfCountry(countryIsoCode) : []),
    [countryIsoCode],
  );

  const [interests, setInterests] = useState<string[]>([]);
  const [culturalConnections, setCulturalConnections] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError(t("errors.displayNameRequired"));
      return;
    }
    if (displayName.trim().length > 255) {
      setError(t("errors.displayNameTooLong"));
      return;
    }

    setLoading(true);
    try {
      const input: SaveProfileInput = {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        photoUrl: photoUrl || null,
        locationCity: locationCity.trim() || null,
        locationState: locationState.trim() || null,
        locationCountry: locationCountry.trim() || null,
        interests,
        culturalConnections,
        languages,
      };

      const result = await saveProfileAction(input);

      if (!result.success) {
        setError(result.error ?? t("errors.saveFailed"));
        return;
      }

      onComplete();
    } catch {
      setError(t("errors.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium text-gray-700">
          {t("displayNameLabel")}
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("displayNamePlaceholder")}
          maxLength={255}
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bio" className="text-sm font-medium text-gray-700">
          {t("bioLabel")}
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t("bioPlaceholder")}
          rows={3}
          maxLength={2000}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <ProfilePhotoUpload photoUrl={photoUrl} onPhotoUrl={setPhotoUrl} />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-gray-700">{t("locationHeading")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="locationCity" className="text-xs text-gray-600">
              {t("locationCityLabel")}
            </label>
            <input
              id="locationCity"
              type="text"
              value={locationCity}
              onChange={(e) => setLocationCity(e.target.value)}
              maxLength={255}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="locationCountry" className="text-xs text-gray-600">
              {t("locationCountryLabel")}
            </label>
            <Select
              value={locationCountry}
              onValueChange={(value) => {
                setLocationCountry(value);
                setLocationState("");
              }}
            >
              <SelectTrigger id="locationCountry" className="w-full">
                <SelectValue placeholder={t("locationCountryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {ALL_COUNTRIES.map((country) => (
                  <SelectItem key={country.isoCode} value={country.name}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="locationState" className="text-xs text-gray-600">
            {t("locationStateLabel")}
          </label>
          {stateOptions.length > 0 ? (
            <Select value={locationState} onValueChange={setLocationState}>
              <SelectTrigger id="locationState" className="w-full">
                <SelectValue placeholder={t("locationStatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {stateOptions.map((state) => (
                  <SelectItem key={state.isoCode} value={state.name}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <input
              id="locationState"
              type="text"
              value={locationState}
              onChange={(e) => setLocationState(e.target.value)}
              maxLength={255}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          )}
        </div>
      </fieldset>

      <TagInput
        id="interests"
        label={t("interestsLabel")}
        placeholder={t("interestsPlaceholder")}
        hint={t("interestsHint")}
        values={interests}
        onChange={setInterests}
      />

      <TagInput
        id="culturalConnections"
        label={t("culturalConnectionsLabel")}
        placeholder={t("culturalConnectionsPlaceholder")}
        values={culturalConnections}
        onChange={setCulturalConnections}
      />

      <TagInput
        id="languages"
        label={t("languagesLabel")}
        placeholder={t("languagesPlaceholder")}
        values={languages}
        onChange={setLanguages}
        maxItems={20}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? t("saving") : t("continueButton")}
      </button>
    </form>
  );
}
