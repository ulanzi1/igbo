import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { SavedSearchList } from "@/components/domain/saved-search-list";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SavedSearchesPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("Portal.savedSearch");

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_SEEKER") {
    redirect(`/${locale}`);
  }

  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("heading")}</h1>
      <SavedSearchList />
    </div>
  );
}
