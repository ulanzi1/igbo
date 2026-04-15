import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getTranslations } from "next-intl/server";
import {
  listPortalAdminAuditLogs,
  getDistinctPortalAuditAdmins,
} from "@igbo/db/queries/portal-admin-audit-logs";
import { AuditLogTable } from "@/components/domain/audit-log-table";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminAuditLogsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
    return null;
  }

  const t = await getTranslations("Portal.admin");

  const [initialData, admins] = await Promise.all([
    listPortalAdminAuditLogs(1, 50),
    getDistinctPortalAuditAdmins(),
  ]);

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{t("auditLogTitle")}</h1>
        <p className="text-muted-foreground">{t("auditLogSubtitle")}</p>
      </div>

      <AuditLogTable
        initialLogs={initialData.logs}
        initialTotal={initialData.total}
        admins={admins}
      />
    </main>
  );
}
