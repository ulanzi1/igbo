import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import { getArticleForEditing } from "@/db/queries/articles";
import { canPublishArticle } from "@/services/permissions";
import { ArticleEditor } from "@/features/articles";
import type { ArticleEditorInitialData } from "@/features/articles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Articles" });
  return { title: t("editor.editDraft") };
}

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ locale: string; articleId: string }>;
}) {
  const { articleId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const permission = await canPublishArticle(session.user.id);
  if (!permission.allowed) {
    redirect("/dashboard?error=article-permission");
  }

  const article = await getArticleForEditing(articleId, session.user.id);
  if (!article) notFound();

  const tier = await getUserMembershipTier(session.user.id);
  const canSetVisibility = tier === "TOP_TIER";

  const initialData: ArticleEditorInitialData = {
    articleId: article.id,
    title: article.title,
    titleIgbo: article.titleIgbo,
    content: article.content,
    contentIgbo: article.contentIgbo,
    coverImageUrl: article.coverImageUrl,
    category: article.category,
    visibility: article.visibility,
    status: article.status,
    rejectionFeedback: article.rejectionFeedback,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ArticleEditor
        articleId={article.id}
        initialData={initialData}
        canSetVisibility={canSetVisibility}
      />
    </main>
  );
}
