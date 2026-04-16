import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import {
  listAllPostingsForAdmin,
  getCompaniesWithPostings,
} from "@igbo/db/queries/portal-admin-all-postings";
import { AllPostingsTable } from "@/components/domain/all-postings-table";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminAllPostingsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  const [initialData, companies] = await Promise.all([
    listAllPostingsForAdmin({ page: 1, pageSize: 20 }),
    getCompaniesWithPostings(),
  ]);

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("allPostingsTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("allPostingsSubtitle")}</p>
      </div>

      <section aria-label={t("allPostingsTitle")}>
        <AllPostingsTable
          initialPostings={initialData.postings}
          initialTotal={initialData.total}
          companies={companies}
        />
      </section>
    </main>
  );
}
