"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface LiftSuspensionDialogProps {
  userId: string;
  suspensionId: string;
  onClose: () => void;
}

export function LiftSuspensionDialog({ userId, suspensionId, onClose }: LiftSuspensionDialogProps) {
  const t = useTranslations("Admin");
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/admin/discipline/${userId}/lift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ suspensionId, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).detail || "Failed to lift suspension");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "discipline", userId] });
      onClose();
    },
  });

  const canConfirm = !mutation.isPending && reason.trim().length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-white mb-4">{t("discipline.liftEarly")}</h2>

        <p className="text-sm text-zinc-300 mb-4">{t("discipline.liftConfirmMessage")}</p>

        <div className="mb-4">
          <label className="block text-sm text-zinc-400 mb-1">
            {t("discipline.liftReason")} <span className="text-red-400">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
            rows={3}
            placeholder={t("discipline.liftReasonRequired")}
            data-testid="lift-reason-input"
          />
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-400 mb-3" data-testid="lift-error">
            {mutation.error.message}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-sm px-4 py-2 min-h-[44px]"
          >
            {t("moderation.action.cancel")}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canConfirm}
            className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50 min-h-[44px]"
            data-testid="lift-confirm-btn"
          >
            {mutation.isPending ? "..." : t("discipline.liftEarly")}
          </button>
        </div>
      </div>
    </div>
  );
}
