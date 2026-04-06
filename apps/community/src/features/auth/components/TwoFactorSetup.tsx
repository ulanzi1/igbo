"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";

interface Props {
  challengeToken: string;
  callbackUrl?: string;
}

type SetupStep = "qr" | "recovery";

export function TwoFactorSetup({ challengeToken, callbackUrl }: Props) {
  const t = useTranslations("Auth.twoFactorSetup");
  const locale = useLocale();
  const router = useRouter();

  const [setupStep, setSetupStep] = useState<SetupStep>("qr");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [verified, setVerifiedToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: setupData, isLoading: loadingQr } = useQuery({
    queryKey: ["2fa-setup", challengeToken],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/auth/2fa/setup?challengeToken=${encodeURIComponent(challengeToken)}`,
      );
      const json = (await res.json()) as { data?: { secret: string; qrCodeDataUrl: string } };
      return json.data ?? null;
    },
  });

  const secret = setupData?.secret ?? "";
  const qrCodeDataUrl = setupData?.qrCodeDataUrl ?? "";

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, secret, code }),
      });

      if (!res.ok) {
        setError(t("invalidCode"));
        return;
      }

      const json = (await res.json()) as {
        data?: { recoveryCodes: string[]; challengeToken: string };
      };
      setRecoveryCodes(json.data?.recoveryCodes ?? []);
      setVerifiedToken(json.data?.challengeToken ?? challengeToken);
      setSetupStep("recovery");
    } catch {
      setError(t("invalidCode"));
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    setLoading(true);
    const result = await signIn("credentials", {
      challengeToken: verified,
      redirect: false,
    });
    if (result?.error) {
      setError(t("invalidCode"));
      setLoading(false);
      return;
    }
    router.push(callbackUrl ?? `/${locale}/onboarding`);
    router.refresh();
  }

  function handleCopy() {
    void navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (setupStep === "recovery") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">{t("recoveryCodesTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("recoveryCodesDescription")}</p>
        </div>

        <div className="rounded-md bg-muted p-4 font-mono text-sm">
          {recoveryCodes.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>

        <button type="button" onClick={handleCopy} className="text-sm text-primary hover:underline">
          {copied ? t("recoveryCodesCopied") : t("copyRecoveryCodes")}
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t("recoveryContinue")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("heading")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {loadingQr ? (
        <div className="h-48 w-48 animate-pulse rounded-md bg-muted" />
      ) : (
        qrCodeDataUrl && (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCodeDataUrl} alt={t("qrCodeAlt")} className="h-48 w-48" />
            <p className="text-xs text-muted-foreground">{t("manualEntry")}</p>
            <code className="rounded bg-muted px-2 py-1 text-xs">{secret}</code>
          </div>
        )
      )}

      <form onSubmit={handleSetup} className="space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium">
            {t("codeLabel")}
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("codePlaceholder")}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            required
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading || loadingQr}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? t("submitting") : t("submitButton")}
        </button>
      </form>
    </div>
  );
}
