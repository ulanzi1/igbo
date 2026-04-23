import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GlobeIcon, UsersIcon, HeartIcon } from "lucide-react";
import { BannerSlider } from "@/components/banner-slider";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SEO" });
  const alternateLocale = locale === "en" ? "ig" : "en";

  return {
    title: t("splashTitle"),
    description: t("splashDescription"),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        ig: "/ig",
      },
    },
    openGraph: {
      title: t("splashTitle"),
      description: t("splashDescription"),
      locale,
      alternateLocale: alternateLocale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("splashTitle"),
      description: t("splashDescription"),
    },
  };
}

const socialProofItems = [
  { key: "stat1" as const, icon: UsersIcon },
  { key: "stat2" as const, icon: GlobeIcon },
  { key: "stat3" as const, icon: HeartIcon },
];

export default async function SplashPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Splash");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://obigbo.com";
  const tSeo = await getTranslations("SEO");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "OBIGBO",
    description: tSeo("siteDescription"),
    url: `${baseUrl}/${locale}`,
  };

  return (
    <div className="flex flex-col">
      {/* ci-allow-unsanitized-html — JSON.stringify + XSS-escape of static schema.org object (no user HTML) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <BannerSlider />

      {/* Hero section */}
      <section className="flex flex-col items-center justify-center gap-6 px-4 py-16 md:py-24 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-primary">
          OB<span className="text-secondary">IG</span>BO
        </h1>
        <p className="text-xl md:text-2xl font-medium text-foreground">{t("subtitle")}</p>
        <p className="text-base md:text-lg text-muted-foreground max-w-2xl">{t("tagline")}</p>

        {/* Three-column CTA layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-8 w-full max-w-3xl">
          <Link
            href="/articles"
            className="flex items-center justify-center min-h-[44px] px-6 py-4 rounded-xl bg-primary text-primary-foreground font-medium text-base hover:opacity-90 transition-opacity text-center"
          >
            {t("exploreGuest")}
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center min-h-[44px] px-6 py-4 rounded-xl bg-secondary text-secondary-foreground font-medium text-base hover:opacity-90 transition-opacity text-center"
          >
            {t("membersLogin")}
          </Link>
          <Link
            href="/apply"
            className="flex items-center justify-center min-h-[44px] px-6 py-4 rounded-xl bg-primary text-primary-foreground font-medium text-base hover:opacity-90 transition-opacity text-center"
          >
            {t("contactJoin")}
          </Link>
        </div>
      </section>

      {/* Social proof section */}
      <section className="bg-muted py-12 px-4" aria-labelledby="social-proof-heading">
        <h2 id="social-proof-heading" className="text-2xl font-semibold text-center mb-8">
          {t("socialProofHeading")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {socialProofItems.map(({ key, icon: Icon }) => (
            <div key={key} className="flex flex-col items-center gap-3 text-center p-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-6" aria-hidden="true" />
              </div>
              <p className="text-base text-foreground font-medium">{t(key)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
