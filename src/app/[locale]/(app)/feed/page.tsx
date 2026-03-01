import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { FeedList } from "@/features/feed";

export const dynamic = "force-dynamic"; // Personalized — never cache at SSR level

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Feed" });
  return { title: t("title") };
}

export default async function FeedPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <FeedList />
    </main>
  );
}
