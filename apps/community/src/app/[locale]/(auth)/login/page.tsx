import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { LoginForm } from "@/features/auth";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string; banned?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth.login" });
  return { title: t("title") };
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { callbackUrl, banned } = await searchParams;
  setRequestLocale(locale);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/login-background.jpg')" }}
    >
      <div className="w-full max-w-md">
        <LoginForm callbackUrl={callbackUrl} banned={banned === "true"} />
      </div>
    </div>
  );
}
