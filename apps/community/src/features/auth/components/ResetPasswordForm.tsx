"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";

interface Props {
  token: string | null;
}

export function ResetPasswordForm({ token }: Props) {
  const t = useTranslations("Auth.resetPassword");
  const locale = useLocale();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{t("tokenInvalid")}</p>
        <Link href={`/${locale}/forgot-password`} className="text-sm text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  function isPasswordValid(pw: string): boolean {
    return (
      pw.length >= 8 &&
      /[A-Z]/.test(pw) &&
      /[a-z]/.test(pw) &&
      /[0-9]/.test(pw) &&
      /[^A-Za-z0-9]/.test(pw)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid(password)) {
      setError(t("passwordWeak"));
      return;
    }

    if (password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { detail?: string };
        if (json.detail?.includes("Invalid or expired")) {
          setError(t("tokenInvalid"));
        } else {
          setError(t("passwordWeak"));
        }
        return;
      }

      setSubmitted(true);
    } catch {
      setError(t("passwordWeak"));
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t("successTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("successDescription")}</p>
        <Link href={`/${locale}/login`} className="block text-sm text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("heading")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium">
            {t("confirmPasswordLabel")}
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("confirmPasswordPlaceholder")}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            required
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? t("submitting") : t("submitButton")}
        </button>
      </form>
    </div>
  );
}
