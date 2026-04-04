import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { SalaryDisplay } from "@/components/semantic/salary-display";
import { CulturalContextBadges } from "@/components/semantic/cultural-context-badges";

interface Posting {
  id: string;
  title: string;
  status: string;
  employmentType: string | null;
  location: string | null;
  salaryMin: number | null | undefined;
  salaryMax: number | null | undefined;
  salaryCompetitiveOnly: boolean;
  createdAt: Date;
  culturalContextJson?: Record<string, boolean> | null;
  descriptionIgboHtml?: string | null;
}

interface JobPostingCardProps {
  posting: Posting;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-orange-100 text-orange-800",
  filled: "bg-blue-100 text-blue-800",
  expired: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
};

export function JobPostingCard({ posting }: JobPostingCardProps) {
  const t = useTranslations("Portal.posting");
  const locale = useLocale();

  const badgeClass = STATUS_BADGE_CLASSES[posting.status] ?? "bg-gray-100 text-gray-700";

  const createdDate = new Date(posting.createdAt).toLocaleDateString(
    locale === "ig" ? "ig-NG" : "en-NG",
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <div className="flex items-start justify-between rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">{posting.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}
            data-testid="status-badge"
          >
            {t(`status.${posting.status}`)}
          </span>
          {posting.employmentType && (
            <span className="text-xs text-muted-foreground">
              {t(`type.${posting.employmentType}`)}
            </span>
          )}
          {posting.location && (
            <span className="text-xs text-muted-foreground">{posting.location}</span>
          )}
          {posting.descriptionIgboHtml && (
            <span
              className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700"
              data-testid="bilingual-badge"
            >
              {t("bilingual")}
            </span>
          )}
        </div>
        <CulturalContextBadges culturalContext={posting.culturalContextJson ?? null} />
        <div className="mt-1 flex items-center gap-3">
          <SalaryDisplay
            min={posting.salaryMin ?? null}
            max={posting.salaryMax ?? null}
            competitiveOnly={posting.salaryCompetitiveOnly}
          />
          <span className="text-xs text-muted-foreground">
            {t("createdAt", { date: createdDate })}
          </span>
        </div>
      </div>
      <Link
        href={`/${locale}/jobs/${posting.id}/edit`}
        className="ml-4 shrink-0 text-sm text-primary hover:underline"
      >
        {t("editPosting")}
      </Link>
    </div>
  );
}

export function JobPostingCardSkeleton() {
  return (
    <div className="flex items-start justify-between rounded-lg border border-border bg-card p-4">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="ml-4 h-4 w-10 animate-pulse rounded bg-muted" />
    </div>
  );
}
