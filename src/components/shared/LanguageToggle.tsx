"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const otherLocale = locale === "en" ? "ig" : "en";
  const label = locale === "en" ? "IG" : "EN";

  function handleSwitch() {
    router.replace(pathname, { locale: otherLocale });
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      aria-label={t("languageToggle")}
      className={cn(
        "relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-background text-foreground text-sm font-medium transition-all",
        "hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      {label}
    </button>
  );
}

export { LanguageToggle };
