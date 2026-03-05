"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface EventDetailActionsProps {
  eventId: string;
  creatorId: string;
}

export function EventDetailActions({ eventId, creatorId }: EventDetailActionsProps) {
  const { data: session } = useSession();
  const t = useTranslations("Events");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  if (!session?.user?.id || session.user.id !== creatorId) {
    return null;
  }

  if (cancelled) {
    return <div className="text-sm text-muted-foreground">{t("cancel.success")}</div>;
  }

  const handleCancel = async () => {
    setIsCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/events/${eventId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json()) as { detail?: string };
        setError(data.detail ?? t("cancel.error"));
      } else {
        setCancelled(true);
        setShowConfirm(false);
      }
    } catch {
      setError(t("cancel.error"));
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/events/${eventId}/edit`}
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        {t("detail.editButton")}
      </Link>

      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center justify-center rounded-md border border-destructive/50 bg-background px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        {t("cancel.button")}
      </button>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg space-y-4">
            <h2 className="text-lg font-semibold">{t("cancel.confirm")}</h2>
            <p className="text-sm text-muted-foreground">{t("cancel.description")}</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isCancelling}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                {t("cancel.keepEvent")}
              </button>
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={isCancelling}
                className="inline-flex items-center justify-center rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
              >
                {isCancelling ? t("cancel.cancelling") : t("cancel.button")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
