"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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

interface DeleteKeywordConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  keyword: {
    id: string;
    phrase: string;
  } | null;
}

export function DeleteKeywordConfirmDialog({
  open,
  onOpenChange,
  onSuccess,
  keyword,
}: DeleteKeywordConfirmDialogProps) {
  const t = useTranslations("Portal.admin");
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!keyword) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/screening/keywords/${keyword.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast.error(t("blocklistError"));
        return;
      }

      toast.success(t("blocklistDeleteSuccess"));
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error(t("blocklistError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("blocklistDeleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {keyword
              ? t("blocklistDeleteConfirm", { phrase: keyword.phrase })
              : t("blocklistDeleteTitle")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            aria-label={keyword ? t("blocklistDelete") : t("blocklistDelete")}
            data-testid="delete-keyword-confirm"
          >
            {loading ? t("submitting") : t("blocklistDelete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteKeywordConfirmDialogSkeleton() {}
