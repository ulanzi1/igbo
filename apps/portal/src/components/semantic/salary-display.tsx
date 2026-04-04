import { useTranslations } from "next-intl";

interface SalaryDisplayProps {
  min?: number | null;
  max?: number | null;
  competitiveOnly: boolean;
}

const formatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function formatAmount(value: number): string {
  return formatter.format(value);
}

export function SalaryDisplay({ min, max, competitiveOnly }: SalaryDisplayProps) {
  const t = useTranslations("Portal.salary");

  if (competitiveOnly) {
    return <span>{t("competitive")}</span>;
  }

  if (min != null && max != null) {
    return <span>{t("rangeFormat", { min: formatAmount(min), max: formatAmount(max) })}</span>;
  }

  if (min != null) {
    return <span>{t("from", { amount: formatAmount(min) })}</span>;
  }

  if (max != null) {
    return <span>{t("upTo", { amount: formatAmount(max) })}</span>;
  }

  return null;
}

export function SalaryDisplaySkeleton() {
  return <span className="inline-block h-4 w-24 animate-pulse rounded bg-muted" />;
}
