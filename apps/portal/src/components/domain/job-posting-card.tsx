import { useTranslations, useLocale } from "next-intl";
import { SalaryDisplay } from "@/components/semantic/salary-display";
import { CulturalContextBadges } from "@/components/semantic/cultural-context-badges";
import type React from "react";

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
  expiresAt?: Date | string | null;
  archivedAt?: Date | string | null;
  culturalContextJson?: Record<string, boolean> | null;
  descriptionIgboHtml?: string | null;
  adminFeedbackComment?: string | null;
}

interface JobPostingCardProps {
  posting: Posting;
  actions?: React.ReactNode;
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

export function JobPostingCard({ posting, actions }: JobPostingCardProps) {
  const t = useTranslations("Portal.posting");
  const et = useTranslations("Portal.expiry");
  const locale = useLocale();

  const badgeClass = STATUS_BADGE_CLASSES[posting.status] ?? "bg-gray-100 text-gray-700";

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(locale === "ig" ? "ig-NG" : "en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const createdDate = formatDate(posting.createdAt);

  const isExpiringSoon =
    posting.status === "active" &&
    posting.expiresAt != null &&
    (() => {
      const d =
        posting.expiresAt instanceof Date ? posting.expiresAt : new Date(posting.expiresAt!);
      const msUntilExpiry = d.getTime() - Date.now();
      return msUntilExpiry > 0 && msUntilExpiry <= 7 * 24 * 60 * 60 * 1000;
    })();

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
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
          {isExpiringSoon && (
            <span
              className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800"
              data-testid="expiring-soon-badge"
            >
              {et("expiringSoon")}
            </span>
          )}
          <div className="mt-1 flex items-center gap-3">
            <SalaryDisplay
              min={posting.salaryMin ?? null}
              max={posting.salaryMax ?? null}
              competitiveOnly={posting.salaryCompetitiveOnly}
            />
            <span className="text-xs text-muted-foreground">
              {t("createdAt", { date: createdDate })}
            </span>
            {posting.expiresAt && posting.status === "active" && (
              <span className="text-xs text-muted-foreground" data-testid="expires-on-text">
                {et("expiresOn", { date: formatDate(posting.expiresAt) })}
              </span>
            )}
            {posting.expiresAt && posting.status === "expired" && (
              <span className="text-xs text-red-600" data-testid="expired-on-text">
                {et("expiredOn", { date: formatDate(posting.expiresAt) })}
              </span>
            )}
            {posting.archivedAt && (
              <span className="text-xs text-muted-foreground" data-testid="archived-on-text">
                {et("archivedOn", { date: formatDate(posting.archivedAt) })}
              </span>
            )}
          </div>
        </div>
      </div>

      {posting.status === "rejected" && posting.adminFeedbackComment && (
        <div
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          data-testid="admin-feedback"
        >
          {posting.adminFeedbackComment}
        </div>
      )}

      {actions && <div className="mt-3">{actions}</div>}
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
