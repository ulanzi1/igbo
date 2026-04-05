"use client";

import { useTranslations } from "next-intl";
import { CulturalContext } from "@/lib/validations/job-posting";

interface CulturalContextTogglesProps {
  value: CulturalContext;
  onChange: (value: CulturalContext) => void;
  disabled?: boolean;
}

export function CulturalContextToggles({ value, onChange, disabled }: CulturalContextTogglesProps) {
  const t = useTranslations("Portal.culturalContext");

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{t("title")}</h3>
      <div className="space-y-3">
        {/* Diaspora-Friendly */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <input
              id="diaspora-friendly"
              type="checkbox"
              checked={value.diasporaFriendly}
              onChange={(e) => onChange({ ...value, diasporaFriendly: e.target.checked })}
              aria-describedby="diaspora-friendly-help"
              disabled={disabled}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="diaspora-friendly" className="text-sm">
              {t("diasporaFriendly")}
            </label>
          </div>
          <p id="diaspora-friendly-help" className="pl-6 text-xs text-muted-foreground">
            {t("diasporaFriendlyHelp")}
          </p>
        </div>

        {/* Igbo Language Preferred */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <input
              id="igbo-language-preferred"
              type="checkbox"
              checked={value.igboLanguagePreferred}
              onChange={(e) => onChange({ ...value, igboLanguagePreferred: e.target.checked })}
              aria-describedby="igbo-language-preferred-help"
              disabled={disabled}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="igbo-language-preferred" className="text-sm">
              {t("igboLanguagePreferred")}
            </label>
          </div>
          <p id="igbo-language-preferred-help" className="pl-6 text-xs text-muted-foreground">
            {t("igboLanguagePreferredHelp")}
          </p>
        </div>

        {/* Community Referred */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <input
              id="community-referred"
              type="checkbox"
              checked={value.communityReferred}
              onChange={(e) => onChange({ ...value, communityReferred: e.target.checked })}
              aria-describedby="community-referred-help"
              disabled={disabled}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="community-referred" className="text-sm">
              {t("communityReferred")}
            </label>
          </div>
          <p id="community-referred-help" className="pl-6 text-xs text-muted-foreground">
            {t("communityReferredHelp")}
          </p>
        </div>
      </div>
    </section>
  );
}

export function CulturalContextTogglesSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3 w-56 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
