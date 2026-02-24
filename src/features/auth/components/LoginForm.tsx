"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { LoginStep } from "@/features/auth/types/auth";

interface Props {
  callbackUrl?: string;
}

export function LoginForm({ callbackUrl }: Props) {
  const t = useTranslations("Auth.login");
  const tf = useTranslations("Auth.twoFactor");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<LoginStep>({ step: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError(t("invalidCredentials"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = (await res.json()) as {
        data?: { requiresMfaSetup: boolean; challengeToken: string };
        status?: number;
        detail?: string;
      };

      if (!res.ok) {
        if (res.status === 429) {
          setError(t("accountLocked"));
        } else {
          setError(t("invalidCredentials"));
        }
        return;
      }

      const { requiresMfaSetup, challengeToken } = json.data!;

      if (requiresMfaSetup) {
        setStep({ step: "2fa-setup", challengeToken });
        router.push(`/${locale}/2fa-setup?challenge=${challengeToken}`);
      } else {
        setStep({ step: "2fa", challengeToken });
      }
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: step.challengeToken, code }),
      });

      if (!res.ok) {
        setError(tf("invalidCode"));
        return;
      }

      const json = (await res.json()) as { data?: { challengeToken: string } };
      const verifiedToken = json.data?.challengeToken ?? step.challengeToken!;

      const result = await signIn("credentials", {
        challengeToken: verifiedToken,
        redirect: false,
      });

      if (result?.error) {
        setError(tf("invalidCode"));
        return;
      }

      router.push(callbackUrl ?? `/${locale}/onboarding`);
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailFallback() {
    setError(null);
    try {
      await fetch("/api/v1/auth/2fa/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: step.challengeToken }),
      });
      setError(tf("emailSent"));
    } catch {
      // ignore
    }
  }

  if (step.step === "2fa") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{tf("heading")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tf("description")}</p>
        </div>

        <form onSubmit={handleTwoFactor} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium">
              {tf("codeLabel")}
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={tf("codePlaceholder")}
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
            {loading ? tf("submitting") : tf("submitButton")}
          </button>
        </form>

        <div className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            onClick={handleEmailFallback}
            className="text-muted-foreground hover:underline"
          >
            {tf("useEmailFallback")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("heading")}</h1>
      </div>

      <form onSubmit={handleCredentials} className="space-y-4">
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")}
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

      <div className="text-center text-sm">
        <a href={`/${locale}/forgot-password`} className="text-primary hover:underline">
          {t("forgotPassword")}
        </a>
      </div>
    </div>
  );
}
