"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
  onSuccess?: () => void;
}

export function TwoFactorResetButton({ userId, onSuccess }: Props) {
  const t = useTranslations("Auth.adminTwoFactorReset");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (!window.confirm(t("resetConfirm"))) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/v1/admin/members/${userId}/reset-2fa`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        setError(t("resetError"));
        return;
      }

      setMessage(t("resetSuccess"));
      onSuccess?.();
    } catch {
      setError(t("resetError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleReset}
        disabled={loading}
        className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
      >
        {t("resetButton")}
      </button>
      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
