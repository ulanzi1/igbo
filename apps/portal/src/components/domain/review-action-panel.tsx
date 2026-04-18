"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_REVISION_COUNT } from "@/lib/portal-errors";
import { RejectPostingModal } from "./reject-posting-modal";
import { RequestChangesModal } from "./request-changes-modal";

interface ReviewActionPanelProps {
  postingId: string;
  postingStatus: string;
  revisionCount: number;
  locale: string;
  previousFeedback?: string | null;
}

export function ReviewActionPanel({
  postingId,
  postingStatus,
  revisionCount,
  locale,
  previousFeedback,
}: ReviewActionPanelProps) {
  const t = useTranslations("Portal.admin");
  const router = useRouter();
  const [approvingLoading, setApprovingLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);

  const atMaxRevisions = revisionCount >= MAX_REVISION_COUNT;

  const handleApprove = async () => {
    setApprovingLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/jobs/${postingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      });

      if (res.ok) {
        toast.success(t("approveSuccess"));
        router.push(`/${locale}/admin/postings`);
      } else {
        toast.error(t("decisionError"));
      }
    } catch {
      toast.error(t("decisionError"));
    } finally {
      setApprovingLoading(false);
    }
  };

  const handleDecisionSuccess = () => {
    router.push(`/${locale}/admin/postings`);
  };

  if (postingStatus !== "pending_review") {
    return null;
  }

  return (
    <section
      aria-label={t("reviewActionsLabel")}
      className="rounded-lg border border-border bg-card p-6"
      data-testid="review-action-panel"
    >
      <h2 className="mb-4 text-lg font-semibold">{t("reviewDecisionHeading")}</h2>

      {previousFeedback && (
        <div
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3"
          data-testid="previous-feedback"
        >
          <p className="mb-1 text-xs font-medium text-amber-800">{t("previousFeedback")}</p>
          <p className="text-sm text-amber-900">{previousFeedback}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {/* Approve — no modal, single click */}
        <Button
          onClick={handleApprove}
          disabled={approvingLoading}
          aria-label={t("approve")}
          data-testid="approve-button"
          className="bg-green-600 text-white hover:bg-green-700"
        >
          {approvingLoading ? t("submitting") : t("approve")}
        </Button>

        {/* Request Changes — disabled at max revisions */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={atMaxRevisions ? 0 : -1}>
                <Button
                  variant="outline"
                  onClick={() => setRequestChangesOpen(true)}
                  disabled={atMaxRevisions}
                  aria-label={t("requestChanges")}
                  aria-disabled={atMaxRevisions}
                  data-testid="request-changes-button"
                >
                  {t("requestChanges")}
                </Button>
              </span>
            </TooltipTrigger>
            {atMaxRevisions && (
              <TooltipContent>
                <p>{t("maxRevisionsReached")}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Reject */}
        <Button
          variant="destructive"
          onClick={() => setRejectOpen(true)}
          aria-label={t("reject")}
          data-testid="reject-button"
        >
          {t("reject")}
        </Button>
      </div>

      <RejectPostingModal
        postingId={postingId}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onSuccess={handleDecisionSuccess}
      />

      <RequestChangesModal
        postingId={postingId}
        open={requestChangesOpen}
        onOpenChange={setRequestChangesOpen}
        onSuccess={handleDecisionSuccess}
      />
    </section>
  );
}

export function ReviewActionPanelSkeleton() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-6"
      aria-busy="true"
      data-testid="review-action-panel-skeleton"
    >
      <div className="mb-4 h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="flex gap-3">
        <div className="h-10 w-24 animate-pulse rounded bg-muted" />
        <div className="h-10 w-36 animate-pulse rounded bg-muted" />
        <div className="h-10 w-20 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
