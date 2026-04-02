"use client";

import { useTranslations } from "next-intl";
import { FileUpload } from "@/components/shared/FileUpload";

interface Props {
  photoUrl: string | null;
  onPhotoUrl: (url: string | null) => void;
  /** Show "Skip for now" link — used in onboarding only */
  showSkip?: boolean;
  disabled?: boolean;
}

export function ProfilePhotoUpload({ photoUrl, onPhotoUrl, showSkip = false, disabled }: Props) {
  const t = useTranslations("Onboarding.profile");

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">{t("photoLabel")}</label>
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100"
          aria-label={photoUrl ? undefined : t("photoPlaceholderAlt")}
          role={photoUrl ? undefined : "img"}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={t("photoAlt")} className="h-full w-full object-cover" />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-8 w-8 text-indigo-400"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">{t("photoUploadHint")}</p>
          <FileUpload
            category="profile_photo"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={disabled}
            onUploadComplete={(_fileUploadId, _objectKey, publicUrl) => onPhotoUrl(publicUrl)}
            triggerLabel={t("photoUploadButton")}
          />
          {showSkip && (
            <button
              type="button"
              onClick={() => onPhotoUrl(null)}
              className="text-xs text-indigo-600 underline hover:text-indigo-800"
            >
              {t("photoSkip")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
