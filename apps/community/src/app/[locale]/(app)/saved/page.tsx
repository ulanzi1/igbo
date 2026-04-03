import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { getUserBookmarks } from "@/services/bookmark-service";
import { SavedPostsList } from "@/features/feed/components/SavedPostsList";

export default async function SavedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
    return null;
  }

  const t = await getTranslations("Feed");
  const userId = session.user.id;
  const currentUserRole = session.user.role ?? "MEMBER";

  // SSR initial page of bookmarks
  const { posts, nextCursor } = await getUserBookmarks(userId, { limit: 10 });

  return (
    <main className="container max-w-2xl mx-auto py-6 px-4 space-y-4">
      <h1 className="text-2xl font-bold">{t("bookmarks.savedPageTitle")}</h1>
      <SavedPostsList
        initialPosts={posts}
        initialNextCursor={nextCursor}
        currentUserId={userId}
        currentUserRole={currentUserRole}
      />
    </main>
  );
}
