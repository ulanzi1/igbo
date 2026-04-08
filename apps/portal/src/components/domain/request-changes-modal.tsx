"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface RequestChangesModalProps {
  postingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RequestChangesModal({
  postingId,
  open,
  onOpenChange,
  onSuccess,
}: RequestChangesModalProps) {
  const t = useTranslations("Portal.admin");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValid = feedback.length >= 20;

  const handleClose = () => {
    if (submitting) return;
    setFeedback("");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/jobs/${postingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "changes_requested", feedbackComment: feedback }),
      });

      if (res.ok) {
        toast.success(t("requestChangesSuccess"));
        handleClose();
        onSuccess?.();
      } else {
        toast.error(t("decisionError"));
      }
    } catch {
      toast.error(t("decisionError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("requestChangesTitle")}</DialogTitle>
          <DialogDescription>{t("requestChangesDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="request-changes-feedback">{t("requestChangesFeedback")}</Label>
          <Textarea
            id="request-changes-feedback"
            placeholder={t("requestChangesFeedbackPlaceholder")}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            autoFocus
            data-testid="request-changes-textarea"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            data-testid="request-changes-submit"
          >
            {submitting ? t("submitting") : t("requestChangesConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestChangesModalSkeleton() {
  return null;
}
