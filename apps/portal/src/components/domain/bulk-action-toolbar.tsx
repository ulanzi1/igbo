"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDensity } from "@/providers/density-context";

/**
 * P-2.10: Bulk action toolbar surfaced above the ATS kanban board when one
 * or more candidates are selected. Advance triggers an immediate bulk PATCH;
 * Reject opens a confirmation modal that requires an optional reason string.
 * Message is a placeholder (disabled — messaging is a future release).
 */
export interface BulkActionToolbarProps {
  selectedCount: number;
  applicationIds: string[];
  /** Callback fired after a successful bulk action so the parent can refresh. */
  onBulkComplete: () => void;
  onClear: () => void;
}

export function BulkActionToolbar({
  selectedCount,
  applicationIds,
  onBulkComplete,
  onClear,
}: BulkActionToolbarProps) {
  const t = useTranslations("Portal.ats.bulk");
  const { density } = useDensity();
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const paddingClass = density === "dense" ? "p-2" : "p-3";
  const gapClass = density === "dense" ? "gap-2" : "gap-3";
  const marginClass = density === "dense" ? "mb-2" : "mb-3";

  async function runBulkAction(action: "advance" | "reject", reason?: string): Promise<void> {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/v1/applications/bulk/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationIds,
          action,
          ...(reason ? { reason } : {}),
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`);
      }

      const json = (await res.json()) as {
        data: { processed: number; skipped: number };
      };
      const { processed, skipped } = json.data;

      if (action === "advance") {
        toast.success(t("advanceSuccess", { processed, skipped }));
      } else {
        toast.success(t("rejectSuccess", { processed, skipped }));
      }
      onBulkComplete();
    } catch {
      toast.error(t("bulkError"));
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label={t("ariaToolbar")}
        data-testid="bulk-action-toolbar"
        className={`${marginClass} flex flex-wrap items-center justify-between ${gapClass} rounded-lg border border-primary/40 bg-primary/5 ${paddingClass}`}
      >
        <span className="text-sm font-medium" data-testid="bulk-selected-count">
          {t("selectedCount", { count: selectedCount })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => runBulkAction("advance")}
            disabled={isProcessing}
            data-testid="bulk-advance-button"
          >
            {isProcessing ? t("processing") : t("advance")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setRejectModalOpen(true)}
            disabled={isProcessing}
            data-testid="bulk-reject-button"
          >
            {t("reject")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled
            aria-label={t("messageDisabled")}
            title={t("messageDisabled")}
            data-testid="bulk-message-button"
          >
            {t("message")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={isProcessing}
            data-testid="bulk-clear-button"
          >
            {t("clear")}
          </Button>
        </div>
      </div>

      <BulkRejectModal
        open={rejectModalOpen}
        onOpenChange={setRejectModalOpen}
        count={selectedCount}
        isProcessing={isProcessing}
        onConfirm={async (reason) => {
          setRejectModalOpen(false);
          await runBulkAction("reject", reason || undefined);
        }}
      />
    </>
  );
}

interface BulkRejectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  isProcessing: boolean;
  onConfirm: (reason: string) => void;
}

function BulkRejectModal({
  open,
  onOpenChange,
  count,
  isProcessing,
  onConfirm,
}: BulkRejectModalProps) {
  const t = useTranslations("Portal.ats.bulk.rejectModal");
  const [reason, setReason] = useState("");

  function handleClose() {
    if (isProcessing) return;
    setReason("");
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <AlertDialogContent data-testid="bulk-reject-modal">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { count })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="bulk-reject-reason">{t("reasonLabel")}</Label>
          <Textarea
            id="bulk-reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            maxLength={500}
            rows={3}
            disabled={isProcessing}
            autoFocus
            data-testid="bulk-reject-reason"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing} data-testid="bulk-reject-cancel">
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={isProcessing}
            onClick={() => onConfirm(reason.trim())}
            data-testid="bulk-reject-confirm"
          >
            {isProcessing ? t("confirming") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
