"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type DisciplineAction = "remove" | "dismiss" | "warn" | "suspend" | "ban";

interface DisciplineRecord {
  id: string;
  actionType: "warning" | "suspension" | "ban";
  reason: string;
  createdAt: string;
}

interface ModerationActionDialogProps {
  action: DisciplineAction;
  disciplineHistory?: DisciplineRecord[];
  onConfirm: (params: { reason?: string; durationHours?: number; confirmed?: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
}

const SUSPENSION_DURATIONS = [
  { value: 24, label: "24 hours" },
  { value: 168, label: "7 days" },
  { value: 720, label: "30 days" },
] as const;

export function ModerationActionDialog({
  action,
  disciplineHistory,
  onConfirm,
  onCancel,
  isPending,
}: ModerationActionDialogProps) {
  const t = useTranslations("Admin");
  const [reason, setReason] = useState("");
  const [durationHours, setDurationHours] = useState<24 | 168 | 720>(24);
  const [banConfirmed, setBanConfirmed] = useState(false);

  const isBan = action === "ban";
  const isSuspend = action === "suspend";
  const isWarn = action === "warn";
  const requiresReason = action !== "dismiss";

  const canConfirm =
    !isPending && (!requiresReason || reason.trim().length > 0) && (!isBan || banConfirmed);

  function handleConfirm() {
    const params: { reason?: string; durationHours?: number; confirmed?: boolean } = {};
    if (reason.trim()) params.reason = reason.trim();
    if (isSuspend) params.durationHours = durationHours;
    if (isBan) params.confirmed = true;
    onConfirm(params);
  }

  const getTitle = () => {
    if (isWarn) return t("moderation.action.warnTitle");
    if (isSuspend) return t("moderation.action.suspendTitle");
    if (isBan) return t("moderation.action.banTitle");
    if (action === "remove") return t("moderation.action.confirmRemove");
    return t("moderation.action.dismiss");
  };

  const getConfirmLabel = () => {
    if (isWarn) return t("moderation.action.warn");
    if (isSuspend) return t("moderation.action.suspend");
    if (isBan) return t("moderation.action.ban");
    if (action === "remove") return t("moderation.action.remove");
    return t("moderation.action.dismiss");
  };

  const getButtonClass = () => {
    if (isBan) return "bg-red-900 hover:bg-red-800";
    if (isSuspend) return "bg-orange-700 hover:bg-orange-600";
    if (isWarn) return "bg-yellow-700 hover:bg-yellow-600";
    return "bg-red-700 hover:bg-red-600";
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4">{getTitle()}</h2>

        {/* Discipline History Preview */}
        {disciplineHistory && disciplineHistory.length > 0 && (
          <div className="bg-zinc-800 border border-zinc-700 rounded p-3 mb-4">
            <p className="text-xs text-zinc-400 mb-2">
              {t("moderation.discipline.priorActions", { count: disciplineHistory.length })}
            </p>
            <div className="space-y-1">
              {disciplineHistory.slice(0, 3).map((rec) => (
                <div key={rec.id} className="flex gap-2 text-xs">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      rec.actionType === "ban"
                        ? "bg-red-900 text-red-200"
                        : rec.actionType === "suspension"
                          ? "bg-orange-900 text-orange-200"
                          : "bg-yellow-900 text-yellow-200"
                    }`}
                  >
                    {rec.actionType}
                  </span>
                  <span className="text-zinc-400 truncate">{rec.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reason textarea */}
        <div className="mb-4">
          <label className="block text-sm text-zinc-400 mb-1">
            {t("moderation.action.reason")}
            {requiresReason && <span className="text-red-400 ml-1">*</span>}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
            rows={3}
            placeholder={
              requiresReason
                ? t("moderation.action.reasonRequired")
                : t("moderation.action.reasonOptional")
            }
          />
        </div>

        {/* Duration selector for suspend */}
        {isSuspend && (
          <div className="mb-4">
            <label className="block text-sm text-zinc-400 mb-1">
              {t("moderation.action.suspendDuration")}
            </label>
            <select
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value) as 24 | 168 | 720)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
            >
              {SUSPENSION_DURATIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Ban confirmation checkbox */}
        {isBan && (
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={banConfirmed}
                onChange={(e) => setBanConfirmed(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-red-400">{t("moderation.action.banConfirmCheck")}</span>
            </label>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-zinc-400 hover:text-white text-sm px-4 py-2 min-h-[44px]"
          >
            {t("moderation.action.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`${getButtonClass()} text-white text-sm px-4 py-2 rounded disabled:opacity-50 min-h-[44px]`}
          >
            {isPending ? "..." : getConfirmLabel()}
          </button>
        </div>
      </div>
    </div>
  );
}
