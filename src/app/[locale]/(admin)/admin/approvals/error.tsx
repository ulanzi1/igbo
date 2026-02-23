"use client";

import { useTranslations } from "next-intl";

export default function ApprovalsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tErrors = useTranslations("Errors");
  const tCommon = useTranslations("Common");

  return (
    <div className="p-6 text-center">
      <h2 className="text-xl font-bold text-white mb-4">{tErrors("generic")}</h2>
      <p className="text-zinc-400 mb-6">{tErrors("genericDescription")}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {tCommon("tryAgain")}
      </button>
    </div>
  );
}
