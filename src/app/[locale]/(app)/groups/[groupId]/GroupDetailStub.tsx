"use client";

import { useTranslations } from "next-intl";

export function GroupDetailStub() {
  const t = useTranslations("Groups");

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
      <p>{t("comingSoon")}</p>
    </div>
  );
}
