"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function RetakeTourButton() {
  const t = useTranslations("Settings.profile");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gray-600">{t("retakeTourDescription")}</p>
      <Link
        href="/onboarding?step=tour"
        className="inline-flex w-fit items-center rounded-md bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
      >
        {t("retakeTourButton")}
      </Link>
    </div>
  );
}
