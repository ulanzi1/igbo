import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { TwoFactorSetup } from "@/features/auth";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ challenge?: string; callbackUrl?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.twoFactorSetup" });
  return { title: t("title") };
}

export default async function TwoFactorSetupPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { challenge, callbackUrl } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Auth.twoFactorSetup" });

  if (!challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-destructive">{t("invalidSetupLink")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <TwoFactorSetup challengeToken={challenge} callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
