"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Visibility = "active" | "passive" | "hidden";

interface SeekerVisibilitySectionProps {
  initialVisibility?: Visibility;
}

export function SeekerVisibilitySection({
  initialVisibility = "passive",
}: SeekerVisibilitySectionProps) {
  const t = useTranslations("Portal.seeker");
  const [visibility, setVisibility] = React.useState<Visibility>(initialVisibility);
  const [submitting, setSubmitting] = React.useState(false);

  const options: {
    value: Visibility;
    labelKey: Parameters<typeof t>[0];
    descKey: Parameters<typeof t>[0];
  }[] = [
    { value: "active", labelKey: "visibilityActive", descKey: "visibilityActiveDesc" },
    { value: "passive", labelKey: "visibilityPassive", descKey: "visibilityPassiveDesc" },
    { value: "hidden", labelKey: "visibilityHidden", descKey: "visibilityHiddenDesc" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/seekers/me/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) {
        toast.error(t("visibilityError"));
        return;
      }
      toast.success(t("visibilitySuccess"));
    } catch {
      toast.error(t("visibilityError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={t("visibilityTitle")}>
      <h2 className="text-lg font-semibold mb-4">{t("visibilityTitle")}</h2>
      <fieldset className="mb-6">
        <legend className="sr-only">{t("visibilityTitle")}</legend>
        <div className="space-y-3">
          {options.map(({ value, labelKey, descKey }) => (
            <label
              key={value}
              htmlFor={`visibility-${value}`}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                id={`visibility-${value}`}
                type="radio"
                name="visibility"
                value={value}
                checked={visibility === value}
                onChange={() => setVisibility(value)}
                className="mt-1 h-4 w-4"
              />
              <div>
                <span className="font-medium">{t(labelKey)}</span>
                <p className="text-sm text-muted-foreground">{t(descKey)}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={submitting}>
        {submitting ? "…" : t("visibilitySave")}
      </Button>
    </form>
  );
}
