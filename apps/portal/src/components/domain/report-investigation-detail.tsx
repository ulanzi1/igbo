"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { PortalPostingReport } from "@igbo/db/queries/portal-posting-reports";

interface ReportInvestigationDetailProps {
  postingId: string;
  postingTitle: string;
  reports: PortalPostingReport[];
}

function statusBadgeClass(status: string): string {
  return (
    {
      open: "border-red-500 text-red-700",
      investigating: "border-amber-500 text-amber-700",
      resolved: "border-green-500 text-green-700",
      dismissed: "border-gray-400 text-gray-600",
    }[status] ?? ""
  );
}

const CATEGORY_KEYS: Record<string, string> = {
  scam_fraud: "categoryScamFraud",
  misleading_info: "categoryMisleadingInfo",
  discriminatory_content: "categoryDiscriminatoryContent",
  duplicate_posting: "categoryDuplicatePosting",
  other: "categoryOther",
};

const STATUS_KEYS: Record<string, string> = {
  open: "reportStatusOpen",
  investigating: "reportStatusInvestigating",
  resolved: "reportStatusResolved",
  dismissed: "reportStatusDismissed",
};

export function ReportInvestigationDetail({
  postingId,
  postingTitle,
  reports,
}: ReportInvestigationDetailProps) {
  const t = useTranslations("Portal.admin");
  const tr = useTranslations("Portal.report");
  const router = useRouter();
  const format = useFormatter();
  const [note, setNote] = useState("");
  const [resolutionAction, _setResolutionAction] = useState("dismiss");
  const [submitting, setSubmitting] = useState(false);

  const activeReports = reports.filter((r) => r.status === "open" || r.status === "investigating");
  const formatDate = (d: Date) => format.dateTime(new Date(d), { dateStyle: "medium" });

  const handleResolve = async (endpoint: "resolve" | "dismiss") => {
    if (note.trim().length < 20) {
      toast.error(t("resolveNoteTooShort"));
      return;
    }
    setSubmitting(true);
    try {
      const body =
        endpoint === "resolve"
          ? { resolutionAction, resolutionNote: note.trim() }
          : { resolutionNote: note.trim() };

      const res = await fetch(`/api/v1/admin/reports/postings/${postingId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(
          endpoint === "resolve" ? t("reportsResolvedSuccess") : t("reportsDismissedSuccess"),
        );
        setNote("");
        router.refresh();
      } else {
        toast.error(t("reportsActionError"));
      }
    } catch {
      toast.error(t("reportsActionError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="report-investigation-detail">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="report-detail-title">
            {postingTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("reportsActiveCount", { count: activeReports.length })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/jobs/${postingId}/review`}>{t("reportsViewPosting")}</Link>
        </Button>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="no-reports-message">
          {t("reportsEmpty")}
        </p>
      ) : (
        <div className="space-y-3" data-testid="reports-list">
          {reports.map((report) => (
            <div
              key={report.id}
              className="rounded-md border p-4 text-sm"
              data-testid={`report-item-${report.id}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(report.status)}`}>
                  {t(STATUS_KEYS[report.status] ?? "reportStatusOpen")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(report.createdAt)}
                </span>
              </div>
              <p className="mb-1 font-medium">
                {tr(CATEGORY_KEYS[report.category] ?? "categoryOther")}
              </p>
              <p className="text-muted-foreground">{report.description}</p>
            </div>
          ))}
        </div>
      )}

      {activeReports.length > 0 && (
        <div className="rounded-md border p-4 space-y-4" data-testid="resolution-panel">
          <h3 className="font-medium">{t("reportsResolutionTitle")}</h3>

          <div className="space-y-2">
            <Label htmlFor="resolution-note">{t("reportsResolutionNote")}</Label>
            <Textarea
              id="resolution-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("reportsResolutionNotePlaceholder")}
              rows={3}
              data-testid="resolution-note-textarea"
            />
            <p className="text-xs text-muted-foreground">{t("reportsResolutionNoteHint")}</p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleResolve("dismiss")}
              disabled={submitting || note.trim().length < 20}
              data-testid="dismiss-reports-button"
            >
              {submitting ? t("submitting") : t("reportsDismiss")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => handleResolve("resolve")}
              disabled={submitting || note.trim().length < 20}
              data-testid="resolve-reports-button"
            >
              {submitting ? t("submitting") : t("reportsResolve")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
