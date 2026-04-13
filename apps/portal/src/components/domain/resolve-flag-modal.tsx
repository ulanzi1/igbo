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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type ResolutionAction = "request_changes" | "reject" | "dismiss";

interface ResolveFlagModalProps {
  flagId: string;
  postingTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ResolveFlagModal({
  flagId,
  postingTitle: _postingTitle,
  open,
  onOpenChange,
  onSuccess,
}: ResolveFlagModalProps) {
  const t = useTranslations("Portal.admin");
  const [action, setAction] = useState<ResolutionAction | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValid = action !== "" && note.trim().length >= 20;

  const handleClose = () => {
    if (submitting) return;
    setAction("");
    setNote("");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!isValid || !action) return;
    setSubmitting(true);

    const isDismiss = action === "dismiss";
    const endpoint = isDismiss
      ? `/api/v1/admin/flags/${flagId}/dismiss`
      : `/api/v1/admin/flags/${flagId}/resolve`;
    const body = isDismiss ? { note } : { action, note };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const successMsg = isDismiss ? t("dismissSuccess") : t("resolveSuccess");
        toast.success(successMsg);
        handleClose();
        onSuccess();
      } else {
        toast.error(t("resolveError"));
      }
    } catch {
      toast.error(t("resolveError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resolveFlag")}</DialogTitle>
          <DialogDescription>{t("resolutionAction")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("resolutionAction")}</Label>
            <RadioGroup
              value={action}
              onValueChange={(v) => setAction(v as ResolutionAction)}
              data-testid="resolution-action-group"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="request_changes" id="action-request-changes" />
                <Label htmlFor="action-request-changes" className="font-normal">
                  {t("resolutionRequestChanges")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="reject" id="action-reject" />
                <Label htmlFor="action-reject" className="font-normal">
                  {t("resolutionReject")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="dismiss" id="action-dismiss" />
                <Label htmlFor="action-dismiss" className="font-normal">
                  {t("resolutionDismiss")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resolution-note">{t("resolutionNote")}</Label>
            <Textarea
              id="resolution-note"
              placeholder={t("resolutionNotePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              data-testid="resolution-note-textarea"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            data-testid="resolve-submit-button"
          >
            {submitting ? t("submitting") : t("resolveFlag")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResolveFlagModalSkeleton() {
  return null;
}
