"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

const LOCALE_KEYS = ["en", "ig"] as const;

function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  // Labels are i18n-driven: "English"/"Igbo" in EN, "Bekee"/"Igbo" in IG
  const labels: Record<(typeof LOCALE_KEYS)[number], string> = {
    en: t("language.english"),
    ig: t("language.igbo"),
  };

  function handleSwitch(targetLocale: "en" | "ig") {
    if (targetLocale === locale) return;
    router.replace(pathname, { locale: targetLocale });
    // Persist to DB for authenticated users (fire-and-forget)
    if (session?.user?.id) {
      void fetch("/api/v1/user/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: targetLocale }),
      });
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("languageToggle")}
      className={cn(
        "flex items-center rounded-full border border-border bg-muted overflow-hidden min-h-[44px]",
        className,
      )}
    >
      {LOCALE_KEYS.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={locale === value}
          onClick={() => handleSwitch(value)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            locale === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[value]}
        </button>
      ))}
    </div>
  );
}

export { LanguageToggle };
