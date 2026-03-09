import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/layout/AdminShell";
import { AuditLogTable } from "@/features/admin/components/AuditLogTable";

export default async function AuditLogPage() {
  const t = await getTranslations("Admin");
  return (
    <div>
      <AdminPageHeader
        title={t("auditLog.title")}
        breadcrumbs={[
          { label: t("sidebar.dashboard"), href: "/admin" },
          { label: t("auditLog.title") },
        ]}
      />
      <div className="p-6">
        <AuditLogTable />
      </div>
    </div>
  );
}
