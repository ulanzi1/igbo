import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { getViolationsQueue } from "@/services/admin-review-service";
import { ViolationsTable } from "@/components/domain/violations-table";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ViolationsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  // TODO(P-3.4B): Add pagination UI. Current cap is 100 open flags — sufficient for MVP.
  const { items } = await getViolationsQueue({ limit: 100, offset: 0 });

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8" data-testid="violations-page">
      <h1 className="mb-6 text-2xl font-bold" data-testid="violations-title">
        {t("violationsTitle")}
      </h1>

      <ViolationsTable items={items} locale={locale} onResolved={() => {}} />
    </main>
  );
}
