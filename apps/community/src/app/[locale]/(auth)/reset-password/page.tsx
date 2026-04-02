import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/features/auth";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.resetPassword" });
  return { title: t("title") };
}

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <ResetPasswordForm token={token ?? null} />
      </div>
    </div>
  );
}
