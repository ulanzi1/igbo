"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface ModerationActionDialogProps {
  action: "remove" | "dismiss";
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function ModerationActionDialog({
  action,
  onConfirm,
  onCancel,
  isPending,
}: ModerationActionDialogProps) {
  const t = useTranslations("Admin");
  const [reason, setReason] = useState("");

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-white mb-4">
          {action === "remove"
            ? t("moderation.action.confirmRemove")
            : t("moderation.action.dismiss")}
        </h2>
        <div className="mb-4">
          <label className="block text-sm text-zinc-400 mb-1">
            {t("moderation.action.reason")}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
            rows={3}
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-zinc-400 hover:text-white text-sm px-4 py-2"
          >
            {t("moderation.action.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason || undefined)}
            disabled={isPending}
            className="bg-red-700 hover:bg-red-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
          >
            {isPending
              ? "..."
              : action === "remove"
                ? t("moderation.action.remove")
                : t("moderation.action.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
