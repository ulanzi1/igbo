"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface ArticleLanguageToggleProps {
  enContent: string;
  igContent: string | null;
  isBilingual: boolean;
}

export function ArticleLanguageToggle({
  enContent,
  igContent,
  isBilingual,
}: ArticleLanguageToggleProps) {
  const t = useTranslations("Articles");
  const [activeTab, setActiveTab] = useState<"en" | "ig">("en");

  if (!isBilingual || !igContent) {
    return (
      <div
        className="prose prose-neutral dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: enContent }}
      />
    );
  }

  const activeContent = activeTab === "en" ? enContent : igContent;

  return (
    <div>
      {/* Tab strip */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("en")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "en"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("reading.languageToggle.en")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ig")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "ig"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("reading.languageToggle.ig")}
        </button>
      </div>

      {/* Active content pane */}
      <div
        className="prose prose-neutral dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: activeContent }}
      />
    </div>
  );
}
