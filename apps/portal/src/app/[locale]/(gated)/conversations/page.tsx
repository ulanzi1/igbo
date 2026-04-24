import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { ConversationListView } from "@/components/messaging/ConversationListView";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ConversationsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("Portal.messages");

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}`);
  }

  // Only seeker and employer roles can access conversations
  // Admins are redirected to their dashboard
  const role = session.user.activePortalRole;
  if (role !== "JOB_SEEKER" && role !== "EMPLOYER") {
    redirect(`/${locale}/admin`);
  }

  return (
    <div className="py-6">
      <h1 className="mb-6 text-2xl font-bold">{t("conversationsTitle")}</h1>
      <ConversationListView />
    </div>
  );
}
