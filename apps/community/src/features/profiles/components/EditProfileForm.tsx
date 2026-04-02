"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ProfilePhotoUpload, TagInput, useUpdateProfile } from "@/features/profiles";
import type { CommunityProfile } from "@/db/schema/community-profiles";

interface Props {
  initialProfile: CommunityProfile;
}

export function EditProfileForm({ initialProfile }: Props) {
  const t = useTranslations("Settings.profile");
  const { mutateAsync, isPending } = useUpdateProfile();

  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [bio, setBio] = useState(initialProfile.bio ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialProfile.photoUrl ?? null);
  const [locationCity, setLocationCity] = useState(initialProfile.locationCity ?? "");
  const [locationState, setLocationState] = useState(initialProfile.locationState ?? "");
  const [locationCountry, setLocationCountry] = useState(initialProfile.locationCountry ?? "");
  const [interests, setInterests] = useState<string[]>(initialProfile.interests);
  const [culturalConnections, setCulturalConnections] = useState<string[]>(
    initialProfile.culturalConnections,
  );
  const [languages, setLanguages] = useState<string[]>(initialProfile.languages);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    const result = await mutateAsync({
      displayName,
      bio: bio || null,
      photoUrl,
      locationCity: locationCity || null,
      locationState: locationState || null,
      locationCountry: locationCountry || null,
      interests,
      culturalConnections,
      languages,
    });

    if (result.success) {
      setSuccessMessage(t("successMessage"));
    } else {
      setErrorMessage(result.error ?? t("errorMessage"));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium text-gray-700">
          {t("displayName")}
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={255}
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bio" className="text-sm font-medium text-gray-700">
          {t("bio")}
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={2000}
          rows={4}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <ProfilePhotoUpload photoUrl={photoUrl} onPhotoUrl={setPhotoUrl} disabled={isPending} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="locationCity" className="text-sm font-medium text-gray-700">
            {t("locationCity")}
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
          <label htmlFor="locationState" className="text-sm font-medium text-gray-700">
            {t("locationState")}
          </label>
          <input
            id="locationState"
            type="text"
            value={locationState}
            onChange={(e) => setLocationState(e.target.value)}
            maxLength={255}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="locationCountry" className="text-sm font-medium text-gray-700">
            {t("locationCountry")}
          </label>
          <input
            id="locationCountry"
            type="text"
            value={locationCountry}
            onChange={(e) => setLocationCountry(e.target.value)}
            maxLength={255}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <TagInput
        id="interests"
        label={t("interests")}
        values={interests}
        onChange={setInterests}
        maxItems={50}
      />

      <TagInput
        id="culturalConnections"
        label={t("culturalConnections")}
        values={culturalConnections}
        onChange={setCulturalConnections}
        maxItems={50}
      />

      <TagInput
        id="languages"
        label={t("languages")}
        values={languages}
        onChange={setLanguages}
        maxItems={20}
      />

      {successMessage && (
        <p className="text-sm text-green-600" role="status">
          {successMessage}
        </p>
      )}
      {errorMessage && (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "..." : t("submitButton")}
      </button>
    </form>
  );
}
