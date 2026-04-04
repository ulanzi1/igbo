import { getTranslations } from "next-intl/server";
import { requireCompanyProfile } from "@/lib/require-company-profile";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MyJobsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("Portal.nav");

  // Gate: employer must have a company profile before accessing this page
  await requireCompanyProfile(locale);

  return (
    <main id="main-content" className="container py-8">
      <h1 className="text-2xl font-bold">{t("myJobs")}</h1>
      <p className="mt-4 text-muted-foreground">{t("myJobsEmpty")}</p>
    </main>
  );
}
