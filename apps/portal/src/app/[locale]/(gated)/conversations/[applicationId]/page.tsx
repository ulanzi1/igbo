import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { ConversationThread } from "@/components/messaging/ConversationThread";
import { Link } from "@/i18n/navigation";
import { getConversationStatus } from "@/services/conversation-service";

interface PageProps {
  params: Promise<{ locale: string; applicationId: string }>;
}

export default async function ConversationDetailPage({ params }: PageProps) {
  const { locale, applicationId } = await params;
  const t = await getTranslations("Portal.messages");

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}`);
  }

  const role = session.user.activePortalRole;
  if (role !== "JOB_SEEKER" && role !== "EMPLOYER") {
    redirect(`/${locale}/admin`);
  }

  // Fetch conversation status for SSR (provides readOnly flag)
  // Fail-closed: default readOnly=true so transient errors don't grant write access
  const convStatus = await getConversationStatus(applicationId, session.user.id).catch(() => ({
    exists: false,
    readOnly: true,
    unreadCount: 0,
  }));

  // If conversation doesn't exist and user is a seeker, redirect to application detail
  if (!convStatus.exists && role === "JOB_SEEKER") {
    redirect(`/${locale}/applications/${applicationId}`);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Back link */}
      <div className="border-b px-4 py-3">
        <Link
          href="/conversations"
          className="text-sm text-muted-foreground hover:text-foreground"
          aria-label={t("conversationsTitle")}
        >
          ← {t("conversationsTitle")}
        </Link>
      </div>

      {/* Thread */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ConversationThread applicationId={applicationId} readOnly={convStatus.readOnly} />
      </div>
    </div>
  );
}
