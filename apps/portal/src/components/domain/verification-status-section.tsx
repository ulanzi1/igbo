"use client";

import { useTranslations } from "next-intl";
import { useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
/** Service-level verification status (includes "verified" from trustBadge) */
export type VerificationDisplayStatus = "verified" | "pending" | "rejected" | "unverified";

interface VerificationStatusSectionProps {
  status: VerificationDisplayStatus;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  adminNotes?: string | null;
}

const STATUS_BADGE: Record<VerificationDisplayStatus, { label: string; className: string }> = {
  verified: { label: "statusVerified", className: "border-green-500 text-green-700" },
  pending: { label: "statusPending", className: "border-amber-500 text-amber-700" },
  rejected: { label: "statusRejected", className: "border-red-500 text-red-700" },
  unverified: { label: "statusUnverified", className: "border-gray-400 text-muted-foreground" },
};

export function VerificationStatusSection({
  status,
  submittedAt,
  reviewedAt,
  adminNotes,
}: VerificationStatusSectionProps) {
  const t = useTranslations("Portal.verification");
  const format = useFormatter();

  const badge = STATUS_BADGE[status];
  const formatDate = (d: Date) =>
    format.dateTime(new Date(d), { year: "numeric", month: "short", day: "numeric" });

  return (
    <section aria-label={t("statusTitle")} data-testid="verification-status-section">
      <Separator className="my-4" />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("statusTitle")}</h3>
        <Badge
          variant="outline"
          className={`text-xs ${badge.className}`}
          data-testid="verification-status-badge"
        >
          {t(badge.label)}
        </Badge>
      </div>

      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {submittedAt && (
          <p>
            {t("submittedAt")}: {formatDate(submittedAt)}
          </p>
        )}
        {reviewedAt && (
          <p>
            {t("reviewedAt")}: {formatDate(reviewedAt)}
          </p>
        )}
      </div>

      {status === "rejected" && adminNotes && (
        <div
          className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          data-testid="rejection-reason"
        >
          <span className="font-medium">{t("rejectionReason")}: </span>
          {adminNotes}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {(status === "unverified" || status === "rejected") && (
          <Button asChild size="sm" variant="outline">
            <Link href="/company-profile/verification">
              {status === "rejected" ? t("resubmit") : t("requestVerification")}
            </Link>
          </Button>
        )}
        {status === "pending" && (
          <Button asChild size="sm" variant="ghost">
            <Link href="/company-profile/verification">{t("viewDetails")}</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
