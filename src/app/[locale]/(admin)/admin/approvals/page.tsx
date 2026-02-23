import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApprovalsTable } from "@/features/admin/components/ApprovalsTable";
import { QueueSummaryCard } from "@/features/admin/components/QueueSummaryCard";

export default async function ApprovalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Admin");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">{t("approvals.title")}</h1>

      <div className="grid grid-cols-2 gap-4 mb-8 max-w-md">
        <QueueSummaryCard
          status="PENDING_APPROVAL"
          label={t("approvals.statusPending")}
          colorClass="border-l-4 border-l-blue-500"
        />
        <QueueSummaryCard
          status="INFO_REQUESTED"
          label={t("approvals.statusInfoRequested")}
          colorClass="border-l-4 border-l-yellow-500"
        />
      </div>

      <ApprovalsTable />
    </div>
  );
}
