import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { getViolationsQueue } from "@/services/admin-review-service";
import { ViolationsTable } from "@/components/domain/violations-table";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ companyId?: string }>;
}

export default async function ViolationsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const companyIdFilter = resolvedSearchParams.companyId;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  // TODO(P-3.4B): Add pagination UI. Current cap is 100 open flags — sufficient for MVP.
  const { items } = await getViolationsQueue({ limit: 100, offset: 0, companyId: companyIdFilter });

  const companyFilter =
    companyIdFilter && items.length > 0
      ? { id: companyIdFilter, name: items[0]?.companyName ?? companyIdFilter }
      : companyIdFilter
        ? { id: companyIdFilter, name: companyIdFilter }
        : null;

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8" data-testid="violations-page">
      <h1 className="mb-6 text-2xl font-bold" data-testid="violations-title">
        {t("violationsTitle")}
      </h1>

      <ViolationsTable
        items={items}
        companyFilter={companyFilter}
        clearFilterHref={companyIdFilter ? `/${locale}/admin/violations` : undefined}
      />
    </main>
  );
}
