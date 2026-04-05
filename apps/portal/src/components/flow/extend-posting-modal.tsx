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

interface ExtendPostingModalProps {
  postingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ExtendPostingModal({
  postingId,
  open,
  onOpenChange,
  onSuccess,
}: ExtendPostingModalProps) {
  const lt = useTranslations("Portal.lifecycle");
  const et = useTranslations("Portal.expiry");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [dateError, setDateError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setDateError("");

    if (!newExpiresAt) {
      setDateError(et("mustBeFutureDate"));
      return;
    }

    const selected = new Date(newExpiresAt);
    if (selected <= new Date()) {
      setDateError(et("mustBeFutureDate"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/jobs/${postingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStatus: "active",
          newExpiresAt: selected.toISOString(),
          contentChanged: false,
        }),
      });

      if (res.ok) {
        toast.success(et("extendSuccess"));
        onOpenChange(false);
        setNewExpiresAt("");
        onSuccess?.();
      } else {
        toast.error(lt("staleEditError"));
      }
    } catch {
      toast.error(lt("staleEditError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{et("extendPosting")}</DialogTitle>
          <DialogDescription>{et("extendDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <label htmlFor="new-expires-at" className="block text-sm font-medium">
            {et("newExpiryDate")}
          </label>
          <input
            id="new-expires-at"
            type="date"
            value={newExpiresAt}
            onChange={(e) => setNewExpiresAt(e.target.value)}
            data-testid="new-expires-at-input"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {dateError && (
            <p role="alert" className="text-xs text-destructive">
              {dateError}
            </p>
          )}
        </div>

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
            disabled={submitting}
            onClick={handleConfirm}
            data-testid="extend-confirm-button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "..." : et("extend")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExtendPostingModalSkeleton() {
  return <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />;
}
