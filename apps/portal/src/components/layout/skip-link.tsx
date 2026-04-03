"use client";

import { useTranslations } from "next-intl";

export function SkipLink({ href }: { href: string }) {
  const t = useTranslations("Shell");
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
    >
      {t("skipToContent")}
    </a>
  );
}
