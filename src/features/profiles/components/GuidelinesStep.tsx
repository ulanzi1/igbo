"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { acknowledgeGuidelinesAction } from "@/features/profiles";

interface Props {
  /** Pre-sanitized HTML from server — safe to render via dangerouslySetInnerHTML */
  guidelinesHtml: string;
  onComplete: () => void;
}

export function GuidelinesStep({ guidelinesHtml, onComplete }: Props) {
  const t = useTranslations("Onboarding.guidelines");

  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!acknowledged) {
      setError(t("errors.mustAcknowledge"));
      return;
    }

    setLoading(true);
    try {
      const result = await acknowledgeGuidelinesAction();
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
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
      <div
        className="prose prose-sm max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4"
        // guidelinesHtml is sanitized server-side before being passed as a prop
        dangerouslySetInnerHTML={{ __html: guidelinesHtml }}
      />

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-700">{t("acknowledgeLabel")}</span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !acknowledged}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? t("saving") : t("continueButton")}
      </button>
    </form>
  );
}
