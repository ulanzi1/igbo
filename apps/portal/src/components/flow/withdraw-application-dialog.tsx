"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

interface WithdrawApplicationDialogProps {
  applicationId: string;
  jobTitle: string;
  currentStatus: PortalApplicationStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function WithdrawApplicationDialog({
  applicationId,
  jobTitle,
  currentStatus,
  open,
  onOpenChange,
  onSuccess,
}: WithdrawApplicationDialogProps) {
  const t = useTranslations("Portal.applications.withdraw");
  const [reason, setReason] = useState("");
  const [ackOfferDeclined, setAckOfferDeclined] = useState(false);
  const [loading, setLoading] = useState(false);

  const isOffered = currentStatus === "offered";
  const confirmDisabled = loading || (isOffered && !ackOfferDeclined);

  // Reset transient form state whenever the dialog closes so a stale reason or
  // a previously-checked offer-ack does not bleed into the next open.
  useEffect(() => {
    if (!open) {
      setReason("");
      setAckOfferDeclined(false);
      setLoading(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/applications/${applicationId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });

      if (res.ok) {
        toast.success(t("toastSuccess"));
        onSuccess();
        onOpenChange(false);
      } else {
        let errorKey: string = t("toastError");
        try {
          // ApiError.toProblemDetails() spreads `extensions` flat onto the body
          // (Object.assign(result, this.extensions)), so the error code lives at
          // body.code, NOT body.extensions.code.
          const body = await res.json();
          const code = body?.code;
          if (code === PORTAL_ERRORS.INVALID_STATUS_TRANSITION) {
            errorKey = t("errorInvalidTransition");
          } else if (code === PORTAL_ERRORS.NOT_FOUND) {
            errorKey = t("errorNotFound");
          }
        } catch {
          // fall through to default error
        }
        toast.error(errorKey);
      }
    } catch {
      toast.error(t("toastError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("dialogTitle", { jobTitle })}</AlertDialogTitle>
          <AlertDialogDescription>{t("dialogDescription")}</AlertDialogDescription>
        </AlertDialogHeader>

        {/* Offered-state secondary warning (AC 3) */}
        {isOffered && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
          >
            <p className="font-semibold text-destructive">{t("offeredWarningTitle")}</p>
            <p className="mt-1 text-destructive/80">{t("offeredWarningBody")}</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                id="ack-offer-declined"
                type="checkbox"
                checked={ackOfferDeclined}
                onChange={(e) => setAckOfferDeclined(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-destructive"
              />
              <label
                htmlFor="ack-offer-declined"
                className="cursor-pointer text-sm font-medium text-destructive"
              >
                {t("offeredConfirmCheckbox")}
              </label>
            </div>
          </div>
        )}

        {/* Reason textarea (AC 2) */}
        <div className="space-y-1">
          <Label htmlFor="withdraw-reason">{t("reasonLabel")}</Label>
          <Textarea
            id="withdraw-reason"
            placeholder={t("reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            aria-describedby="withdraw-reason-help"
          />
          <p id="withdraw-reason-help" className="text-xs text-muted-foreground">
            {t("reasonHelp")}
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          {/* Use plain Button (NOT AlertDialogAction) so we control close manually */}
          <Button
            variant="destructive"
            disabled={confirmDisabled}
            aria-busy={loading}
            onClick={handleConfirm}
            data-testid="withdraw-confirm-button"
          >
            {loading ? t("confirmLoading") : t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
