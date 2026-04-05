"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { PortalJobStatus } from "@igbo/db/schema/portal-job-postings";
import { ClosePostingModal } from "@/components/flow/close-posting-modal";

interface PostingStatusActionsProps {
  postingId: string;
  status: PortalJobStatus;
  locale: string;
  onStatusChange?: () => void;
}

export function PostingStatusActions({
  postingId,
  status,
  locale,
  onStatusChange,
}: PostingStatusActionsProps) {
  const t = useTranslations("Portal.posting");
  const lt = useTranslations("Portal.lifecycle");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  const patchStatus = async (targetStatus: PortalJobStatus) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/jobs/${postingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus }),
      });

      if (res.ok) {
        if (onStatusChange) {
          onStatusChange();
        } else {
          router.refresh();
        }
      } else if (res.status === 409) {
        const body = (await res.json()) as { extensions?: { code?: string } };
        if (body?.extensions?.code === "POSTING_LIMIT_EXCEEDED") {
          toast.error(lt("postingLimitReached", { max: "5" }));
        } else {
          toast.error(lt("staleEditError"));
        }
      } else if (res.status === 422) {
        toast.error(lt("cannotEditPendingReview"));
      } else {
        toast.error(t("errorGeneric"));
      }
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSuccess = () => {
    setCloseModalOpen(false);
    if (onStatusChange) {
      onStatusChange();
    } else {
      router.refresh();
    }
  };

  if (status === "pending_review") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="awaiting-review-text">
        {lt("pendingReviewInfo")}
      </p>
    );
  }

  if (status === "filled" || status === "expired") {
    return (
      <div>
        <button
          type="button"
          disabled
          title={lt("comingSoon")}
          aria-label={`${lt("viewApplications")} — ${lt("comingSoon")}`}
          className="cursor-not-allowed text-sm text-muted-foreground opacity-50"
          data-testid="view-applications-disabled"
        >
          {lt("viewApplications")}
        </button>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={`/${locale}/jobs/${postingId}/edit`}
          className="text-sm text-primary hover:underline"
          data-testid="edit-resubmit-link"
        >
          {lt("editAndResubmit")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <>
          <Link
            href={`/${locale}/jobs/${postingId}/preview`}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            data-testid="preview-link"
          >
            {lt("preview")}
          </Link>
          <Link
            href={`/${locale}/jobs/${postingId}/edit`}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            data-testid="edit-link"
          >
            {t("editPosting")}
          </Link>
          <button
            type="button"
            onClick={() => patchStatus("pending_review")}
            disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            data-testid="submit-for-review-button"
          >
            {loading ? t("saving") : lt("submitForReview")}
          </button>
        </>
      )}

      {status === "active" && (
        <>
          <Link
            href={`/${locale}/jobs/${postingId}/edit`}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            data-testid="edit-link"
          >
            {t("editPosting")}
          </Link>
          <button
            type="button"
            onClick={() => patchStatus("paused")}
            disabled={loading}
            className="rounded-md border border-input px-3 py-1.5 text-sm transition-opacity disabled:opacity-50"
            data-testid="pause-button"
          >
            {loading ? t("saving") : lt("pause")}
          </button>
          <button
            type="button"
            onClick={() => setCloseModalOpen(true)}
            disabled={loading}
            className="rounded-md border border-input px-3 py-1.5 text-sm transition-opacity disabled:opacity-50"
            data-testid="close-posting-button"
          >
            {lt("closePosting")}
          </button>
        </>
      )}

      {status === "paused" && (
        <>
          <button
            type="button"
            onClick={() => patchStatus("active")}
            disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            data-testid="unpause-button"
          >
            {loading ? t("saving") : lt("unpause")}
          </button>
          <button
            type="button"
            onClick={() => setCloseModalOpen(true)}
            disabled={loading}
            className="rounded-md border border-input px-3 py-1.5 text-sm transition-opacity disabled:opacity-50"
            data-testid="close-posting-button"
          >
            {lt("closePosting")}
          </button>
        </>
      )}

      <ClosePostingModal
        postingId={postingId}
        open={closeModalOpen}
        onOpenChange={setCloseModalOpen}
        onSuccess={handleCloseSuccess}
      />
    </div>
  );
}

export function PostingStatusActionsSkeleton() {
  return (
    <div className="flex gap-2">
      <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
