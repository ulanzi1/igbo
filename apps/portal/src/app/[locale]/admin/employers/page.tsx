import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { listAllCompaniesForAdmin } from "@igbo/db/queries/portal-admin-all-companies";
import { AllCompaniesTable } from "@/components/domain/all-companies-table";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminEmployersPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  const initialData = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8" data-testid="employers-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="employers-title">
          {t("employersTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("employersSubtitle")}</p>
      </div>

      <section aria-label={t("employersTitle")}>
        <AllCompaniesTable
          initialCompanies={initialData.companies}
          initialTotal={initialData.total}
        />
      </section>
    </main>
  );
}
