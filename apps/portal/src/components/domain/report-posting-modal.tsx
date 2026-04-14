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
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type ReportCategory =
  | "scam_fraud"
  | "misleading_info"
  | "discriminatory_content"
  | "duplicate_posting"
  | "other";

interface ReportPostingModalProps {
  postingId: string;
  postingTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ReportPostingModal({
  postingId,
  postingTitle,
  open,
  onOpenChange,
  onSuccess,
}: ReportPostingModalProps) {
  const t = useTranslations("Portal.report");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [description, setDescription] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValid = category !== "" && description.trim().length >= 20;

  const handleClose = () => {
    if (submitting) return;
    setCategory("");
    setDescription("");
    setShowConfirm(false);
    onOpenChange(false);
  };

  const handleProceedToConfirm = () => {
    if (!isValid) return;
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    if (!isValid || !category) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/reports/postings/${postingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, description }),
      });

      if (res.ok) {
        toast.success(t("reportSuccess"));
        handleClose();
        onSuccess();
      } else if (res.status === 409) {
        toast.error(t("reportAlreadySubmitted"));
      } else if (res.status === 403) {
        toast.error(t("reportOwnPosting"));
      } else {
        toast.error(t("reportError"));
      }
    } catch {
      toast.error(t("reportError"));
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabel: Record<ReportCategory, string> = {
    scam_fraud: t("categoryScamFraud"),
    misleading_info: t("categoryMisleadingInfo"),
    discriminatory_content: t("categoryDiscriminatoryContent"),
    duplicate_posting: t("categoryDuplicatePosting"),
    other: t("categoryOther"),
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {!showConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("modalTitle")}</DialogTitle>
              <DialogDescription id="report-modal-description">
                {t("modalDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <fieldset className="space-y-2">
                <Label asChild>
                  <legend>{t("category")}</legend>
                </Label>
                <RadioGroup
                  value={category}
                  onValueChange={(v) => setCategory(v as ReportCategory)}
                  data-testid="report-category-group"
                >
                  {(
                    [
                      ["scam_fraud", t("categoryScamFraud")],
                      ["misleading_info", t("categoryMisleadingInfo")],
                      ["discriminatory_content", t("categoryDiscriminatoryContent")],
                      ["duplicate_posting", t("categoryDuplicatePosting")],
                      ["other", t("categoryOther")],
                    ] as const
                  ).map(([value, label]) => (
                    <div key={value} className="flex items-center gap-2">
                      <RadioGroupItem
                        value={value}
                        id={`report-category-${value}`}
                        data-testid={`report-category-${value}`}
                      />
                      <Label htmlFor={`report-category-${value}`} className="font-normal">
                        {label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="report-description">{t("description")}</Label>
                <Textarea
                  id="report-description"
                  placeholder={t("descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  data-testid="report-description-textarea"
                />
                <p className="text-xs text-muted-foreground">{t("descriptionHint")}</p>
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
                data-testid="report-proceed-button"
              >
                {t("submitReport")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("confirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("confirmDescription", { title: postingTitle })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {category && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t("category")}:</span>
                  <Badge variant="outline" data-testid="confirm-category-badge">
                    {categoryLabel[category as ReportCategory]}
                  </Badge>
                </div>
              )}
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirm(false)}
                autoFocus
                data-testid="report-confirm-back"
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleSubmit}
                disabled={submitting}
                data-testid="report-confirm-submit"
              >
                {submitting ? t("submitting") : t("confirmSubmit")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
