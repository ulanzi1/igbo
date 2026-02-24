"use client";

import { useTranslations } from "next-intl";

interface Props {
  photoUrl: string | null;
  onPhotoUrl: (url: string | null) => void;
}

/**
 * Profile photo upload component.
 * Photo upload wires to POST /api/v1/upload/presign (Story 1.14 endpoint).
 * Until Story 1.14 ships, the field is optional with a skip affordance.
 * TODO: wire presigned URL call when Story 1.14 ships.
 */
export function ProfilePhotoUpload({ photoUrl, onPhotoUrl }: Props) {
  const t = useTranslations("Onboarding.profile");

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">{t("photoLabel")}</label>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-indigo-400">👤</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500">{t("photoUploadHint")}</p>
          {/* TODO: Story 1.14 — wire to POST /api/v1/upload/presign */}
          <button
            type="button"
            onClick={() => onPhotoUrl(null)}
            className="text-xs text-indigo-600 underline hover:text-indigo-800"
          >
            {t("photoSkip")}
          </button>
        </div>
      </div>
    </div>
  );
}
