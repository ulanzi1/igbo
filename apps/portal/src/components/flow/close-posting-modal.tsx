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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { PortalClosedOutcome } from "@igbo/db/schema/portal-job-postings";

const CLOSED_OUTCOMES: PortalClosedOutcome[] = [
  "filled_via_portal",
  "filled_internally",
  "cancelled",
];

interface ClosePostingModalProps {
  postingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ClosePostingModal({
  postingId,
  open,
  onOpenChange,
  onSuccess,
}: ClosePostingModalProps) {
  const t = useTranslations("Portal.posting");
  const lt = useTranslations("Portal.lifecycle");
  const [selectedOutcome, setSelectedOutcome] = useState<PortalClosedOutcome | "">("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selectedOutcome) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/jobs/${postingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus: "filled", closedOutcome: selectedOutcome }),
      });

      if (res.ok) {
        toast.success(lt("closeSuccess"));
        setSelectedOutcome("");
        onSuccess?.();
      } else {
        toast.error(t("errorGeneric"));
      }
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lt("closeModalTitle")}</DialogTitle>
          <DialogDescription>{lt("closeModalDescription")}</DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selectedOutcome}
          onValueChange={(v) => setSelectedOutcome(v as PortalClosedOutcome)}
          data-testid="close-outcome-radio-group"
        >
          {CLOSED_OUTCOMES.map((outcome) => (
            <div key={outcome} className="flex items-center gap-2">
              <RadioGroupItem value={outcome} id={`outcome-${outcome}`} />
              <label htmlFor={`outcome-${outcome}`} className="cursor-pointer text-sm">
                {t(`closedOutcome.${outcome}`)}
              </label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-input px-4 py-2 text-sm"
          >
            {lt("cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedOutcome || submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            data-testid="confirm-close-button"
          >
            {submitting ? t("saving") : lt("closeConfirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClosePostingModalSkeleton() {
  return null;
}
