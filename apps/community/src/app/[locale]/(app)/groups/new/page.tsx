import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { canCreateGroup } from "@igbo/auth/permissions";
import { GroupCreationForm } from "@/features/groups";

export const dynamic = "force-dynamic"; // Personalized — never cache at SSR level

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Groups" });
  return { title: t("createGroup") };
}

export default async function NewGroupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const permission = await canCreateGroup(session.user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <GroupCreationForm canCreate={permission.allowed} />
    </main>
  );
}
