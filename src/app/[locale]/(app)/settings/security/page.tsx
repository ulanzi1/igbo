import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { SessionList } from "@/features/auth";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.security" });
  return { title: t("title") };
}

export default async function SecuritySettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Auth.security" });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t("heading")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SessionList />
    </div>
  );
}
