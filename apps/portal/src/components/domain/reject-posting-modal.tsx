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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RejectionCategory =
  | "policy_violation"
  | "inappropriate_content"
  | "insufficient_detail"
  | "other";

interface RejectPostingModalProps {
  postingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RejectPostingModal({
  postingId,
  open,
  onOpenChange,
  onSuccess,
}: RejectPostingModalProps) {
  const t = useTranslations("Portal.admin");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<RejectionCategory | "">("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValid = reason.length >= 20 && category !== "";

  const handleClose = () => {
    if (submitting) return;
    setReason("");
    setCategory("");
    setShowConfirm(false);
    onOpenChange(false);
  };

  const handleProceedToConfirm = () => {
    if (!isValid) return;
    setShowConfirm(true);
  };

  const handleConfirmReject = async () => {
    if (!isValid || !category) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/jobs/${postingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected", reason, category }),
      });

      if (res.ok) {
        toast.success(t("rejectSuccess"));
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
        {!showConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("rejectTitle")}</DialogTitle>
              <DialogDescription>{t("rejectDescription")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reject-reason">{t("rejectReason")}</Label>
                <Textarea
                  id="reject-reason"
                  placeholder={t("rejectReasonPlaceholder")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  autoFocus
                  data-testid="reject-reason-textarea"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reject-category">{t("rejectCategory")}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as RejectionCategory)}>
                  <SelectTrigger id="reject-category" data-testid="reject-category-select">
                    <SelectValue placeholder={t("rejectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="policy_violation">
                      {t("rejectCategoryPolicyViolation")}
                    </SelectItem>
                    <SelectItem value="inappropriate_content">
                      {t("rejectCategoryInappropriateContent")}
                    </SelectItem>
                    <SelectItem value="insufficient_detail">
                      {t("rejectCategoryInsufficientDetail")}
                    </SelectItem>
                    <SelectItem value="other">{t("rejectCategoryOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleProceedToConfirm}
                disabled={!isValid}
                data-testid="reject-proceed-button"
              >
                {t("reject")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("rejectConfirm")}</DialogTitle>
              <DialogDescription>{t("rejectConfirmDescription")}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              {/* Focus cancel by default for asymmetric friction */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirm(false)}
                autoFocus
                data-testid="reject-confirm-cancel"
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmReject}
                disabled={submitting}
                data-testid="reject-confirm-button"
              >
                {submitting ? t("submitting") : t("rejectConfirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RejectPostingModalSkeleton() {
  return null;
}
