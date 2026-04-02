"use client";

import { useTranslations } from "next-intl";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");
  const tCommon = useTranslations("Common");

  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center gap-4"
    >
      <h1 className="text-4xl font-bold">{t("generic")}</h1>
      <p className="text-lg text-muted-foreground">{t("genericDescription")}</p>
      <button
        className="mt-2 rounded-md bg-primary px-4 py-2 text-primary-foreground min-h-[44px]"
        onClick={() => reset()}
      >
        {tCommon("tryAgain")}
      </button>
    </main>
  );
}
