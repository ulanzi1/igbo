import { setRequestLocale, getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { SearchResultsContent } from "@/features/discover/components/SearchResultsContent";
import type { SearchFilters } from "@igbo/db/queries/search";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  const t = await getTranslations({ locale, namespace: "GlobalSearch" });
  return {
    title: q ? t("resultsPage.title", { query: q }) : t("ariaLabel"),
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    dateRange?: string;
    dateFrom?: string;
    dateTo?: string;
    authorId?: string;
    category?: string;
    location?: string;
    membershipTier?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/auth/login`);
    return null;
  }

  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const type = sp.type;

  const filters: SearchFilters = {};
  if (sp.dateRange && ["today", "week", "month", "custom"].includes(sp.dateRange)) {
    filters.dateRange = sp.dateRange as SearchFilters["dateRange"];
  }
  if (sp.dateFrom) filters.dateFrom = sp.dateFrom;
  if (sp.dateTo) filters.dateTo = sp.dateTo;
  if (sp.authorId) filters.authorId = sp.authorId;
  if (sp.category && ["discussion", "event", "announcement"].includes(sp.category)) {
    filters.category = sp.category as SearchFilters["category"];
  }
  if (sp.location) filters.location = sp.location;
  if (sp.membershipTier && ["BASIC", "PROFESSIONAL", "TOP_TIER"].includes(sp.membershipTier)) {
    filters.membershipTier = sp.membershipTier as SearchFilters["membershipTier"];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <SearchResultsContent initialQuery={query} initialType={type} initialFilters={filters} />
    </div>
  );
}
