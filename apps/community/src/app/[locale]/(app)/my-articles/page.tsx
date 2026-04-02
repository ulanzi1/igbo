import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { listArticlesByAuthor } from "@igbo/db/queries/articles";
import { MyArticlesList } from "@/features/articles/components/MyArticlesList";

export const dynamic = "force-dynamic";

export default async function MyArticlesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const articles = await listArticlesByAuthor(session.user.id);
  const t = await getTranslations("Articles");
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t("myArticles.title")}</h1>
      <MyArticlesList articles={articles} />
    </main>
  );
}
