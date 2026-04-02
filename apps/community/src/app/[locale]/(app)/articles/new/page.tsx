import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { canPublishArticle, PERMISSION_MATRIX } from "@/services/permissions";
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

  const tier = await getUserMembershipTier(session.user.id);
  const permission = await canPublishArticle(session.user.id);
  if (!permission.allowed) {
    const t = await getTranslations("Articles");
    const maxPerWeek = PERMISSION_MATRIX[tier].maxArticlesPerWeek;
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
          <div className="max-w-md space-y-3">
            <h2 className="text-xl font-semibold">{t("limit.title")}</h2>
            <p className="text-muted-foreground">{t("limit.body", { count: maxPerWeek })}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {t("limit.dashboard")}
            </Link>
            <Link
              href="/my-articles"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {t("myArticles.title")}
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {t("limit.chat")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const canSetVisibility = tier === "TOP_TIER";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ArticleEditor canSetVisibility={canSetVisibility} />
    </main>
  );
}
