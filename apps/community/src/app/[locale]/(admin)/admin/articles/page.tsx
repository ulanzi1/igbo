import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleReviewQueue } from "@/features/admin/components/ArticleReviewQueue";
import { AdminPageHeader } from "@/components/layout/AdminShell";

export default async function AdminArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Admin");

  return (
    <>
      <AdminPageHeader
        title={t("articles.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("sidebar.articles") },
        ]}
      />
      <div className="p-6">
        <ArticleReviewQueue />
      </div>
    </>
  );
}
