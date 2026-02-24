"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useUpdatePrivacySettings } from "@/features/profiles/hooks/use-profile";

type ProfileVisibility = "PUBLIC_TO_MEMBERS" | "LIMITED" | "PRIVATE";

interface Props {
  initialVisibility: ProfileVisibility;
  initialLocationVisible: boolean;
}

export function PrivacySettings({ initialVisibility, initialLocationVisible }: Props) {
  const t = useTranslations("Settings.privacy");
  const { mutateAsync, isPending } = useUpdatePrivacySettings();

  const [visibility, setVisibility] = useState<ProfileVisibility>(initialVisibility);
  const [locationVisible, setLocationVisible] = useState(initialLocationVisible);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function handleVisibilityChange(value: ProfileVisibility) {
    setVisibility(value);
    setStatus("idle");
    const result = await mutateAsync({ profileVisibility: value });
    setStatus(result.success ? "success" : "error");
  }

  async function handleLocationToggle(checked: boolean) {
    setLocationVisible(checked);
    setStatus("idle");
    const result = await mutateAsync({ locationVisible: checked });
    setStatus(result.success ? "success" : "error");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t("heading")}</h2>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700">
          {t("profileVisibility.label")}
        </legend>
        <div className="mt-2 space-y-2">
          {(["PUBLIC_TO_MEMBERS", "LIMITED", "PRIVATE"] as const).map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="profileVisibility"
                value={option}
                checked={visibility === option}
                onChange={() => void handleVisibilityChange(option)}
                className="h-4 w-4 text-indigo-600"
              />
              <span className="text-sm text-gray-700">
                {t(
                  `profileVisibility.${option.toLowerCase() as "public_to_members" | "limited" | "private"}`,
                )}
              </span>
              {option === "LIMITED" && (
                <span className="text-xs text-gray-500">{t("profileVisibility.limitedNote")}</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">{t("locationVisible.label")}</p>
          <p className="text-xs text-gray-500">{t("locationVisible.description")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={locationVisible}
          onClick={() => void handleLocationToggle(!locationVisible)}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            locationVisible ? "bg-indigo-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              locationVisible ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {status === "success" && (
        <p className="text-sm text-green-600" role="status">
          {t("successMessage")}
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {t("errorMessage")}
        </p>
      )}
    </div>
  );
}
