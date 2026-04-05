"use client";

import { useTranslations } from "next-intl";

interface LanguageToggleProps {
  activeLanguage: "en" | "ig";
  onLanguageChange: (lang: "en" | "ig") => void;
  hasIgbo: boolean;
}

export function LanguageToggle({ activeLanguage, onLanguageChange, hasIgbo }: LanguageToggleProps) {
  const t = useTranslations("Portal.languageToggle");

  if (!hasIgbo) return null;

  const handleKeyDown = (e: React.KeyboardEvent, lang: "en" | "ig") => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onLanguageChange(lang);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      onLanguageChange(lang === "en" ? "ig" : "en");
    }
  };

  return (
    <div role="tablist" aria-label={t("bilingual")} className="flex gap-1 border-b border-border">
      <button
        role="tab"
        type="button"
        aria-selected={activeLanguage === "en"}
        tabIndex={activeLanguage === "en" ? 0 : -1}
        onClick={() => onLanguageChange("en")}
        onKeyDown={(e) => handleKeyDown(e, "en")}
        className={`px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          activeLanguage === "en"
            ? "border-b-2 border-primary text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {t("english")}
      </button>
      <button
        role="tab"
        type="button"
        aria-selected={activeLanguage === "ig"}
        tabIndex={activeLanguage === "ig" ? 0 : -1}
        onClick={() => onLanguageChange("ig")}
        onKeyDown={(e) => handleKeyDown(e, "ig")}
        className={`px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          activeLanguage === "ig"
            ? "border-b-2 border-primary text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {t("igbo")}
      </button>
    </div>
  );
}
