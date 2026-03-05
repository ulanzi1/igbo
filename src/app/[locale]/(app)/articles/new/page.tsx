import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { canPublishArticle } from "@/services/permissions";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import { ArticleEditor } from "@/features/articles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Articles" });
  return { title: t("nav.writeArticle") };
}

export default async function NewArticlePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const permission = await canPublishArticle(session.user.id);
  if (!permission.allowed) {
    redirect("/dashboard?error=article-permission");
  }

  const tier = await getUserMembershipTier(session.user.id);
  const canSetVisibility = tier === "TOP_TIER";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ArticleEditor canSetVisibility={canSetVisibility} />
    </main>
  );
}
