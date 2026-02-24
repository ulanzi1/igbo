"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth.forgotPassword");
  const locale = useLocale();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes("@")) {
      setError(t("invalidEmail"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        setError(t("invalidEmail"));
        return;
      }

      setSubmitted(true);
    } catch {
      setError(t("invalidEmail"));
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
          <label htmlFor="email" className="block text-sm font-medium">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
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

      <div className="text-sm">
        <Link href={`/${locale}/login`} className="text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
