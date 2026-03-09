"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";

type ReportContentType = "post" | "comment" | "message" | "member" | "article";
type ReportReasonCategory =
  | "harassment"
  | "spam"
  | "inappropriate_content"
  | "misinformation"
  | "impersonation"
  | "other";

interface ReportDialogProps {
  contentType: ReportContentType;
  contentId: string;
  onClose: () => void;
}

const REASON_CATEGORIES: ReportReasonCategory[] = [
  "harassment",
  "spam",
  "inappropriate_content",
  "misinformation",
  "impersonation",
  "other",
];

// Map DB enum values to i18n key names
const REASON_KEY_MAP: Record<ReportReasonCategory, string> = {
  harassment: "harassment",
  spam: "spam",
  inappropriate_content: "inappropriateContent",
  misinformation: "misinformation",
  impersonation: "impersonation",
  other: "other",
};

export function ReportDialog({ contentType, contentId, onClose }: ReportDialogProps) {
  const t = useTranslations("Reports");
  const [selectedReason, setSelectedReason] = useState<ReportReasonCategory | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [alreadyReported, setAlreadyReported] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  // Focus first radio on mount
  useEffect(() => {
    firstRadioRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedReason) throw new Error("No reason selected");
      const res = await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contentType,
          contentId,
          reasonCategory: selectedReason,
          reasonText:
            selectedReason === "other" && reasonText.trim() ? reasonText.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error("Report submission failed");
      return res.json() as Promise<{ data: { alreadyReported?: boolean; reportId?: string } }>;
    },
    onSuccess: (result) => {
      if (result.data.alreadyReported) {
        setAlreadyReported(true);
      } else {
        setSubmitted(true);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) return;
    mutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-md shadow-xl"
      >
        <h2 id="report-dialog-title" className="text-lg font-semibold mb-2">
          {t("dialog.title")}
        </h2>

        {submitted ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">{t("success")}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium min-h-[44px]"
            >
              {t("close")}
            </button>
          </div>
        ) : alreadyReported ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">{t("alreadyReported")}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-muted text-foreground py-2 text-sm font-medium min-h-[44px]"
            >
              {t("close")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-muted-foreground mb-4">{t("dialog.description")}</p>

            <fieldset className="space-y-2 mb-4">
              <legend className="sr-only">{t("dialog.title")}</legend>
              {REASON_CATEGORIES.map((reason, i) => (
                <label
                  key={reason}
                  className="flex items-center gap-3 cursor-pointer rounded-md p-2 hover:bg-accent transition-colors min-h-[44px]"
                >
                  <input
                    ref={i === 0 ? firstRadioRef : undefined}
                    type="radio"
                    name="reasonCategory"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm">{t(`reason.${REASON_KEY_MAP[reason]}`)}</span>
                </label>
              ))}
            </fieldset>

            {selectedReason === "other" && (
              <div className="mb-4">
                <label className="sr-only" htmlFor="report-reason-text">
                  {t("reason.other")}
                </label>
                <textarea
                  id="report-reason-text"
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder={t("reason.otherPlaceholder")}
                  maxLength={1000}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border bg-background py-2 text-sm font-medium min-h-[44px] hover:bg-accent transition-colors"
              >
                {/* Cancel */}✕
              </button>
              <button
                type="submit"
                disabled={!selectedReason || mutation.isPending}
                className="flex-1 rounded-md bg-destructive text-destructive-foreground py-2 text-sm font-medium min-h-[44px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? t("submitting") : t("submit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
