import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ApplicationForm, ResendForm } from "@/features/auth";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });

  return {
    title: t("applyTitle"),
    description: t("applyDescription"),
    alternates: {
      canonical: `/${locale}/apply`,
      languages: {
        en: "/en/apply",
        ig: "/ig/apply",
      },
    },
    openGraph: {
      title: t("applyTitle"),
      description: t("applyDescription"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("applyTitle"),
      description: t("applyDescription"),
    },
  };
}

type ApplyStatus = "email-verified" | "token-expired" | "token-invalid" | null;

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Apply");
  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status : null;
  const status = (
    ["email-verified", "token-expired", "token-invalid"].includes(statusParam ?? "")
      ? statusParam
      : null
  ) as ApplyStatus;

  // Cloudflare geo headers for location prefill (absent in local dev — fields render empty)
  const headersList = await headers();
  const geoDefaults = {
    city: headersList.get("CF-IPCity") ?? "",
    state: headersList.get("CF-IPRegion") ?? "",
    country: headersList.get("CF-IPCountry") ?? "",
  };

  // Email verified confirmation page
  if (status === "email-verified") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="text-5xl mb-6" aria-hidden="true">
          ✓
        </div>
        <h1 className="text-3xl font-bold text-primary mb-4">{t("emailVerified.title")}</h1>
        <p className="text-base text-muted-foreground mb-8">{t("emailVerified.description")}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-xl border border-border bg-background text-foreground font-medium text-base hover:bg-muted transition-colors"
        >
          {t("backToHome")}
        </Link>
      </div>
    );
  }

  // Token expired or already used
  if (status === "token-expired") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-primary mb-4">{t("tokenExpired.title")}</h1>
        <p className="text-base text-muted-foreground mb-8">{t("tokenExpired.description")}</p>
        <ResendForm emailPlaceholder={t("tokenExpired.emailPlaceholder")} />
      </div>
    );
  }

  // Invalid token
  if (status === "token-invalid") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-primary mb-4">{t("tokenInvalid.title")}</h1>
        <p className="text-base text-muted-foreground mb-8">{t("tokenInvalid.description")}</p>
        <ResendForm emailPlaceholder={t("tokenInvalid.emailPlaceholder")} />
      </div>
    );
  }

  // Default: show the multi-step application form
  return <ApplicationForm geoDefaults={geoDefaults} />;
}
