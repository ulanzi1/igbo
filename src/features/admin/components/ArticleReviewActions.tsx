"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface ArticleReviewActionsProps {
  articleId: string;
  /** "pending" shows Approve/Reject; "published" shows Feature toggle */
  mode: "pending" | "published";
  isFeatured?: boolean;
}

export function ArticleReviewActions({
  articleId,
  mode,
  isFeatured = false,
}: ArticleReviewActionsProps) {
  const t = useTranslations("Admin");
  const queryClient = useQueryClient();

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");

  const invalidateQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/admin/articles/${articleId}/publish`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Host: window.location.host,
          Origin: window.location.origin,
        },
      });
      if (!res.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => {
      toast.success(t("articles.approveSuccess"));
      invalidateQueries();
    },
    onError: () => {
      toast.error(t("articles.approveError"));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (fb: string) => {
      const res = await fetch(`/api/v1/admin/articles/${articleId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Host: window.location.host,
          Origin: window.location.origin,
        },
        body: JSON.stringify({ feedback: fb }),
      });
      if (!res.ok) throw new Error("Failed to reject");
    },
    onSuccess: () => {
      toast.success(t("articles.rejectSuccess"));
      setShowRejectDialog(false);
      setFeedback("");
      invalidateQueries();
    },
    onError: () => {
      toast.error(t("articles.rejectError"));
    },
  });

  const requestRevisionMutation = useMutation({
    mutationFn: async (fb: string) => {
      const res = await fetch(`/api/v1/admin/articles/${articleId}/request-revision`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Host: window.location.host,
          Origin: window.location.origin,
        },
        body: JSON.stringify({ feedback: fb }),
      });
      if (!res.ok) throw new Error("Failed to request revision");
    },
    onSuccess: () => {
      toast.success(t("articles.revisionSuccess"));
      setShowRevisionDialog(false);
      setRevisionFeedback("");
      invalidateQueries();
    },
    onError: () => {
      toast.error(t("articles.revisionError"));
    },
  });

  const featureMutation = useMutation({
    mutationFn: async (featured: boolean) => {
      const res = await fetch(`/api/v1/admin/articles/${articleId}/feature`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Host: window.location.host,
          Origin: window.location.origin,
        },
        body: JSON.stringify({ featured }),
      });
      if (!res.ok) throw new Error("Failed to update featured status");
    },
    onSuccess: () => {
      invalidateQueries();
    },
    onError: () => {
      toast.error(t("articles.featureError"));
    },
  });

  if (mode === "published") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={isFeatured}
          aria-label={isFeatured ? t("articles.unfeature") : t("articles.feature")}
          disabled={featureMutation.isPending}
          onClick={() => featureMutation.mutate(!isFeatured)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            isFeatured ? "bg-yellow-500" : "bg-zinc-600"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
              isFeatured ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-xs text-zinc-400">
          {isFeatured ? t("articles.unfeature") : t("articles.feature")}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => approveMutation.mutate()}
          disabled={
            approveMutation.isPending ||
            rejectMutation.isPending ||
            requestRevisionMutation.isPending
          }
          className="bg-green-700 hover:bg-green-600 text-white"
        >
          {t("articles.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowRevisionDialog(true)}
          disabled={
            approveMutation.isPending ||
            rejectMutation.isPending ||
            requestRevisionMutation.isPending
          }
        >
          {t("articles.requestRevision")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setShowRejectDialog(true)}
          disabled={
            approveMutation.isPending ||
            rejectMutation.isPending ||
            requestRevisionMutation.isPending
          }
        >
          {t("articles.reject")}
        </Button>
      </div>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("articles.rejectConfirm")}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t("articles.feedbackLabel")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label htmlFor="reject-feedback" className="text-zinc-300 text-sm mb-1 block">
              {t("articles.feedbackLabel")}
            </label>
            <textarea
              id="reject-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t("articles.feedbackPlaceholder")}
              maxLength={1000}
              rows={4}
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            {feedback.trim() === "" && (
              <p className="text-xs text-red-400 mt-1">{t("articles.rejectionFeedbackRequired")}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              onClick={() => {
                setShowRejectDialog(false);
                setFeedback("");
              }}
            >
              {t("articles.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-600 text-white"
              onClick={() => rejectMutation.mutate(feedback)}
              disabled={rejectMutation.isPending || feedback.trim() === ""}
            >
              {t("articles.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Request Revision Dialog */}
      <AlertDialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("articles.revisionConfirm")}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t("articles.revisionFeedbackLabel")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label htmlFor="revision-feedback" className="text-zinc-300 text-sm mb-1 block">
              {t("articles.revisionFeedbackLabel")}
            </label>
            <textarea
              id="revision-feedback"
              value={revisionFeedback}
              onChange={(e) => setRevisionFeedback(e.target.value)}
              placeholder={t("articles.revisionFeedbackPlaceholder")}
              maxLength={1000}
              rows={4}
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              onClick={() => {
                setShowRevisionDialog(false);
                setRevisionFeedback("");
              }}
            >
              {t("articles.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-500 text-white"
              onClick={() => requestRevisionMutation.mutate(revisionFeedback)}
              disabled={requestRevisionMutation.isPending || revisionFeedback.trim() === ""}
            >
              {t("articles.revisionSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
