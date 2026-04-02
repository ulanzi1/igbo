"use client";

import { useTranslations } from "next-intl";

type EventFormat = "virtual" | "in_person" | "hybrid";

interface EventFormatBadgeProps {
  format: EventFormat;
}

const FORMAT_COLORS: Record<EventFormat, string> = {
  virtual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_person: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  hybrid: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

export function EventFormatBadge({ format }: EventFormatBadgeProps) {
  const t = useTranslations("Events");
  const formatKey = format === "in_person" ? "inPerson" : format;

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${FORMAT_COLORS[format]}`}
    >
      {t(`format.${formatKey}`)}
    </span>
  );
}
