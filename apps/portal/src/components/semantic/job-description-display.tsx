"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { LanguageToggle } from "@/components/domain/language-toggle";

interface JobDescriptionDisplayProps {
  descriptionHtml: string;
  descriptionIgboHtml?: string | null;
}

export function JobDescriptionDisplay({
  descriptionHtml,
  descriptionIgboHtml,
}: JobDescriptionDisplayProps) {
  const locale = useLocale();
  const [activeLanguage, setActiveLanguage] = useState<"en" | "ig">(
    locale === "ig" && descriptionIgboHtml ? "ig" : "en",
  );

  const activeHtml =
    activeLanguage === "ig" && descriptionIgboHtml ? descriptionIgboHtml : descriptionHtml;

  return (
    <div className="space-y-3">
      <LanguageToggle
        activeLanguage={activeLanguage}
        onLanguageChange={setActiveLanguage}
        hasIgbo={!!descriptionIgboHtml}
      />
      {/* ci-allow-unsanitized-html — descriptionHtml/descriptionIgboHtml are sanitized by server page before passing as props */}
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: activeHtml }} />
    </div>
  );
}
