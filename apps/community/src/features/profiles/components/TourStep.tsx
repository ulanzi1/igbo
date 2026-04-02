"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { completeTourAction } from "@/features/profiles";
import { useRouter } from "@/i18n/navigation";

const TOUR_SECTIONS = ["dashboard", "chat", "directory", "groups", "events", "articles"] as const;

interface Props {
  onComplete?: () => void;
}

export function TourStep({ onComplete }: Props) {
  const t = useTranslations("Onboarding.tour");
  const router = useRouter();
  const { update } = useSession();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function finish(skipped: boolean) {
    setError(null);
    setLoading(true);
    try {
      const result = await completeTourAction({ skipped });
      if (!result.success) {
        setError(result.error ?? t("errors.saveFailed"));
        return;
      }
      // Refresh JWT so profileCompleted: true is reflected in the middleware gate
      await update({ profileCompleted: true });

      if (onComplete) {
        onComplete();
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError(t("errors.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  const currentSection = TOUR_SECTIONS[currentIndex];

  return (
    <div className="flex flex-col gap-6">
      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {TOUR_SECTIONS.map((section, i) => (
          <button
            key={section}
            type="button"
            onClick={() => setCurrentIndex(i)}
            aria-label={`Go to ${section} step`}
            className={`h-2 w-2 rounded-full transition-colors ${
              i === currentIndex ? "bg-indigo-600" : "bg-gray-300"
            }`}
          />
        ))}
      </div>

      {/* Tour card */}
      {currentSection && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-6 text-center">
          <h3 className="text-lg font-semibold text-indigo-900">
            {t(`sections.${currentSection}.title`)}
          </h3>
          <p className="mt-2 text-sm text-indigo-700">
            {t(`sections.${currentSection}.description`)}
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:invisible"
        >
          {t("backButton")}
        </button>

        {currentIndex < TOUR_SECTIONS.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => i + 1)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t("nextButton")}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => void finish(false)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? t("completing") : t("completeButton")}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="text-center">
        <button
          type="button"
          disabled={loading}
          onClick={() => void finish(true)}
          className="text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
        >
          {t("skipButton")}
        </button>
      </div>
    </div>
  );
}
