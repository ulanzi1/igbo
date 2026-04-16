import { setRequestLocale, getTranslations } from "next-intl/server";
import { JobSearchPageContent } from "@/components/domain/job-search-page-content";

interface SearchPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: SearchPageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "Portal.search" });
  const query = typeof sp["q"] === "string" ? sp["q"] : undefined;
  const title = query
    ? `${t("pageTitle")} — "${query}" — OBIGBO Job Portal`
    : `${t("pageTitle")} — OBIGBO Job Portal`;
  return { title };
}

/**
 * Public (ungated) search page.
 *
 * AC #1: Accessible to both authenticated users and unauthenticated guests.
 * The (ungated) route group does not enforce authentication.
 *
 * AC #2: Search state is derived from URL params and passed to the client component
 * as `initialParams` to hydrate without a client-side flash.
 */
export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Await search params for initial SSR hydration — passed as opaque Record to
  // the client component which will re-read from useSearchParams() at runtime.
  const initialParams = await searchParams;

  return <JobSearchPageContent initialParams={initialParams} />;
}
