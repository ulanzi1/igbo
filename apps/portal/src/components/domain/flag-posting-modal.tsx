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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type ViolationCategory =
  | "misleading_content"
  | "discriminatory_language"
  | "scam_fraud"
  | "terms_of_service_violation"
  | "other";

type Severity = "low" | "medium" | "high";

interface FlagPostingModalProps {
  postingId: string;
  postingTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function FlagPostingModal({
  postingId,
  postingTitle,
  open,
  onOpenChange,
  onSuccess,
}: FlagPostingModalProps) {
  const t = useTranslations("Portal.admin");
  const [category, setCategory] = useState<ViolationCategory | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [description, setDescription] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValid = category !== "" && severity !== "" && description.trim().length >= 20;

  const handleClose = () => {
    if (submitting) return;
    setCategory("");
    setSeverity("");
    setDescription("");
    setShowConfirm(false);
    onOpenChange(false);
  };

  const handleProceedToConfirm = () => {
    if (!isValid) return;
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    if (!isValid || !category || !severity) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/jobs/${postingId}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, severity, description }),
      });

      if (res.ok) {
        toast.success(t("flagSuccess"));
        handleClose();
        onSuccess();
      } else if (res.status === 409) {
        toast.error(t("flagAlreadyOpen"));
      } else {
        toast.error(t("flagError"));
      }
    } catch {
      toast.error(t("flagError"));
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabel: Record<ViolationCategory, string> = {
    misleading_content: t("categoryMisleadingContent"),
    discriminatory_language: t("categoryDiscriminatoryLanguage"),
    scam_fraud: t("categoryScamFraud"),
    terms_of_service_violation: t("categoryTermsOfServiceViolation"),
    other: t("categoryOther"),
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {!showConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("flagModalTitle")}</DialogTitle>
              <DialogDescription id="flag-modal-description">
                {t("flagModalDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="flag-category">{t("flagCategory")}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ViolationCategory)}>
                  <SelectTrigger id="flag-category" data-testid="flag-category-select">
                    <SelectValue placeholder={t("flagCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="misleading_content">
                      {t("categoryMisleadingContent")}
                    </SelectItem>
                    <SelectItem value="discriminatory_language">
                      {t("categoryDiscriminatoryLanguage")}
                    </SelectItem>
                    <SelectItem value="scam_fraud">{t("categoryScamFraud")}</SelectItem>
                    <SelectItem value="terms_of_service_violation">
                      {t("categoryTermsOfServiceViolation")}
                    </SelectItem>
                    <SelectItem value="other">{t("categoryOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("flagSeverity")}</Label>
                <RadioGroup
                  value={severity}
                  onValueChange={(v) => setSeverity(v as Severity)}
                  data-testid="flag-severity-group"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="low" id="severity-low" />
                    <Label htmlFor="severity-low" className="font-normal">
                      {t("severityLowLabel")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="medium" id="severity-medium" />
                    <Label htmlFor="severity-medium" className="font-normal">
                      {t("severityMediumLabel")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="high" id="severity-high" />
                    <Label htmlFor="severity-high" className="font-normal">
                      {t("severityHighLabel")}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="flag-description">{t("flagDescription")}</Label>
                <Textarea
                  id="flag-description"
                  placeholder={t("flagDescriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  data-testid="flag-description-textarea"
                />
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
                data-testid="flag-proceed-button"
              >
                {t("flagForViolation")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("flagConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("flagConfirmDescription", { title: postingTitle })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {category && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t("flagCategory")}:</span>
                  <Badge variant="outline" data-testid="confirm-category-badge">
                    {categoryLabel[category as ViolationCategory]}
                  </Badge>
                </div>
              )}
              {severity && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t("flagSeverity")}:</span>
                  <Badge
                    variant="outline"
                    aria-label={`${t("flagSeverity")}: ${severity}`}
                    data-testid="confirm-severity-badge"
                  >
                    {severity}
                  </Badge>
                </div>
              )}
              {severity === "high" && (
                <p
                  className="rounded bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                  data-testid="high-severity-warning"
                >
                  {t("flagHighSeverityWarning")}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirm(false)}
                autoFocus
                data-testid="flag-confirm-back"
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleSubmit}
                disabled={submitting}
                data-testid="flag-confirm-submit"
              >
                {submitting ? t("submitting") : t("flagSubmit")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FlagPostingModalSkeleton() {
  return null;
}
