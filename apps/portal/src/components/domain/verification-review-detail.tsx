"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PortalEmployerVerification } from "@igbo/db/schema/portal-employer-verifications";

interface VerificationReviewDetailProps {
  verification: PortalEmployerVerification & {
    history: PortalEmployerVerification[];
    openViolationCount: number;
    companyName: string;
    ownerUserName: string;
  };
}

const STATUS_BADGE: Record<string, string> = {
  pending: "border-amber-500 text-amber-700",
  approved: "border-green-500 text-green-700",
  rejected: "border-red-500 text-red-700",
};

export function VerificationReviewDetail({ verification }: VerificationReviewDetailProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();
  const router = useRouter();

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | undefined>();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const isPending = verification.status === "pending";

  const formatDate = (d: Date | null) => {
    if (!d) return "—";
    return format.dateTime(new Date(d), { year: "numeric", month: "short", day: "numeric" });
  };

  const docs = Array.isArray(verification.submittedDocuments)
    ? (verification.submittedDocuments as Array<{
        fileUploadId: string;
        objectKey: string;
        originalFilename: string;
      }>)
    : [];

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/v1/admin/verifications/${verification.id}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(t("verificationApproveSuccess"));
        router.push("/admin/verifications");
      } else {
        toast.error(t("verificationApproveError"));
      }
    } catch {
      toast.error(t("verificationApproveError"));
    } finally {
      setApproving(false);
      setApproveOpen(false);
    }
  }

  async function handleReject() {
    if (rejectReason.trim().length < 20) {
      setRejectError(t("verificationRejectReasonTooShort"));
      return;
    }
    setRejecting(true);
    setRejectError(undefined);
    try {
      const res = await fetch(`/api/v1/admin/verifications/${verification.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.ok) {
        toast.success(t("verificationRejectSuccess"));
        router.push("/admin/verifications");
      } else {
        toast.error(t("verificationRejectError"));
      }
    } catch {
      toast.error(t("verificationRejectError"));
    } finally {
      setRejecting(false);
      setRejectOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Company info */}
      <section aria-labelledby="company-info-heading">
        <h2 id="company-info-heading" className="text-sm font-medium mb-2">
          {t("verificationCompanyInfo")}
        </h2>
        <div className="rounded-md border border-border bg-muted/30 p-4 flex flex-col gap-2 text-sm">
          <div>
            <span className="font-medium">{t("verificationsCompany")}: </span>
            {verification.companyName}
          </div>
          <div>
            <span className="font-medium">{t("verificationsEmployer")}: </span>
            {verification.ownerUserName}
          </div>
          <div>
            <span className="font-medium">{t("verificationsSubmittedAt")}: </span>
            {formatDate(verification.submittedAt)}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{t("verificationsStatus")}: </span>
            <Badge
              variant="outline"
              className={`text-xs ${STATUS_BADGE[verification.status] ?? "border-gray-400 text-muted-foreground"}`}
              data-testid="detail-status-badge"
            >
              {t(
                verification.status === "pending"
                  ? "verificationsPending"
                  : verification.status === "approved"
                    ? "verificationsApproved"
                    : "verificationsRejected",
              )}
            </Badge>
          </div>
          {verification.openViolationCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-red-400 text-red-700 text-xs">
                {t("verificationOpenViolations", { count: verification.openViolationCount })}
              </Badge>
              <Link
                href="/admin/violations"
                className="text-xs text-primary underline hover:no-underline"
              >
                {t("verificationViewViolations")}
              </Link>
            </div>
          )}
        </div>
      </section>

      <Separator />

      {/* Documents */}
      <section aria-labelledby="documents-heading">
        <h2 id="documents-heading" className="text-sm font-medium mb-2">
          {t("verificationDocumentsList")}
        </h2>
        <div className="flex flex-col gap-2">
          {docs.map((doc) => (
            <div
              key={doc.fileUploadId}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              data-testid="document-row"
            >
              <span className="text-sm">{doc.originalFilename}</span>
              <Button asChild size="sm" variant="outline">
                <a
                  href={`/api/v1/admin/file/${doc.objectKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("verificationViewDoc")}
                </a>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* History */}
      {verification.history.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-sm font-medium mb-2">
            {t("verificationHistory")}
          </h2>
          <div className="flex flex-col gap-2">
            {verification.history.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 text-xs text-muted-foreground"
                data-testid="history-row"
              >
                <Badge variant="outline" className={`text-xs ${STATUS_BADGE[h.status] ?? ""}`}>
                  {t(
                    h.status === "pending"
                      ? "verificationsPending"
                      : h.status === "approved"
                        ? "verificationsApproved"
                        : "verificationsRejected",
                  )}
                </Badge>
                <span>{formatDate(h.submittedAt)}</span>
                {h.reviewedAt && <span>{formatDate(h.reviewedAt)}</span>}
              </div>
            ))}
          </div>
          <Separator className="mt-4" />
        </section>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex gap-3" data-testid="action-buttons">
          <Button onClick={() => setApproveOpen(true)} data-testid="approve-btn">
            {t("verificationApprove")}
          </Button>
          <Button variant="outline" onClick={() => setRejectOpen(true)} data-testid="reject-btn">
            {t("verificationReject")}
          </Button>
        </div>
      )}

      {/* Approve dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("verificationApprove")}</AlertDialogTitle>
            <AlertDialogDescription>{t("verificationApproveConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={approving}>
              {approving ? t("verificationProcessing") : t("verificationApprove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("verificationReject")}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="px-6 py-2">
            <Label htmlFor="reject-reason">{t("verificationRejectReason")}</Label>
            <Textarea
              id="reject-reason"
              className="mt-2"
              rows={4}
              placeholder={t("verificationRejectReasonPlaceholder")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              aria-describedby={rejectError ? "reject-error" : undefined}
            />
            {rejectError && (
              <p id="reject-error" className="mt-1 text-xs text-destructive" role="alert">
                {rejectError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={rejecting}>
              {rejecting ? t("verificationProcessing") : t("verificationReject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
