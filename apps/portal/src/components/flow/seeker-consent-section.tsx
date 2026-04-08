"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface SeekerConsentSectionProps {
  initialConsentMatching?: boolean;
  initialConsentEmployerView?: boolean;
  matchingChangedAt?: string | null;
  employerViewChangedAt?: string | null;
}

export function SeekerConsentSection({
  initialConsentMatching = false,
  initialConsentEmployerView = false,
  matchingChangedAt,
  employerViewChangedAt,
}: SeekerConsentSectionProps) {
  const t = useTranslations("Portal.seeker");
  const [consentMatching, setConsentMatching] = React.useState(initialConsentMatching);
  const [consentEmployerView, setConsentEmployerView] = React.useState(initialConsentEmployerView);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/seekers/me/consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentMatching, consentEmployerView }),
      });
      if (!res.ok) {
        toast.error(t("consentError"));
        return;
      }
      toast.success(t("consentSuccess"));
    } catch {
      toast.error(t("consentError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={t("consentTitle")}>
      <h2 className="text-lg font-semibold mb-4">{t("consentTitle")}</h2>

      <div className="space-y-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label htmlFor="consent-matching" className="text-base font-medium">
              {t("consentMatchingLabel")}
            </Label>
            <p className="text-sm text-muted-foreground mt-1">{t("consentMatchingDesc")}</p>
            {matchingChangedAt && (
              <p className="text-xs text-muted-foreground mt-1" data-testid="matching-changed-at">
                {t("consentLastChanged", {
                  date: new Date(matchingChangedAt).toLocaleDateString(),
                })}
              </p>
            )}
          </div>
          <Switch
            id="consent-matching"
            checked={consentMatching}
            onCheckedChange={setConsentMatching}
            aria-label={t("consentMatchingLabel")}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label htmlFor="consent-employer-view" className="text-base font-medium">
              {t("consentEmployerViewLabel")}
            </Label>
            <p className="text-sm text-muted-foreground mt-1">{t("consentEmployerViewDesc")}</p>
            {employerViewChangedAt && (
              <p
                className="text-xs text-muted-foreground mt-1"
                data-testid="employer-view-changed-at"
              >
                {t("consentLastChanged", {
                  date: new Date(employerViewChangedAt).toLocaleDateString(),
                })}
              </p>
            )}
          </div>
          <Switch
            id="consent-employer-view"
            checked={consentEmployerView}
            onCheckedChange={setConsentEmployerView}
            aria-label={t("consentEmployerViewLabel")}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">{t("consentNote")}</p>

      <Button type="submit" disabled={submitting}>
        {submitting ? "…" : t("consentSave")}
      </Button>
    </form>
  );
}
