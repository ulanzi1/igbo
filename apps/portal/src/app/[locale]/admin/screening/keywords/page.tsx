import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import { listScreeningKeywords } from "@igbo/db/queries/portal-screening-keywords";
import { KeywordManager } from "@/components/domain/keyword-manager";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ScreeningKeywordsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  const { items, total } = await listScreeningKeywords({ limit: 100, offset: 0 });

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8" data-testid="screening-keywords-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="page-title">
          {t("blocklistTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("blocklistDescription")}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <KeywordManager initialKeywords={items} initialTotal={total} />
      </div>
    </main>
  );
}
