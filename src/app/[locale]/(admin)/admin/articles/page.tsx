import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleReviewQueue } from "@/features/admin/components/ArticleReviewQueue";

export default async function AdminArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Admin");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">{t("articles.title")}</h1>
      <ArticleReviewQueue />
    </div>
  );
}
