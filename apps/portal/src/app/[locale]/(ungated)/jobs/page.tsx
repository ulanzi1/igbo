import { setRequestLocale, getTranslations } from "next-intl/server";
import { JobDiscoveryPageContent } from "@/components/domain/job-discovery-page-content";
import { getDiscoveryPageData } from "@/services/job-search-service";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portal.discovery" });
  return {
    title: `${t("pageTitle")} — OBIGBO Job Portal`,
  };
}

/**
 * Discovery page — ungated, accessible to guests and authenticated users.
 *
 * Fetches featured jobs, industry category counts, and recent postings
 * server-side and passes them as props to the client component.
 * No client-side fetch on initial load (SSR-first per AC #5).
 */
export default async function JobsDiscoveryPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const data = await getDiscoveryPageData(locale);

  return <JobDiscoveryPageContent {...data} />;
}
