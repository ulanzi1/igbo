"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApplications } from "@/features/admin/hooks/use-approvals";
import { ApplicationRow } from "@/features/admin/components/ApplicationRow";

export function ApprovalsTable() {
  const t = useTranslations("Admin");
  const { data, isPending, isError } = useApplications("PENDING_APPROVAL");
  const [activeIndex, setActiveIndex] = useState(0);

  if (isPending) {
    return (
      <div className="text-center py-12 text-zinc-400" role="status" aria-live="polite">
        {t("approvals.loading")}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-red-400" role="alert">
        {t("approvals.error")}
      </div>
    );
  }

  const applications = data?.data ?? [];

  if (applications.length === 0) {
    return <div className="text-center py-12 text-zinc-400">{t("approvals.empty")}</div>;
  }

  const handleNext = () => {
    setActiveIndex((prev) => Math.min(prev + 1, applications.length - 1));
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-zinc-700 bg-zinc-800/50">
            <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
              {t("approvals.columnApplicant")}
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
              {t("approvals.columnLocation")}
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
              {t("approvals.columnCulturalConnection")}
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
              {t("approvals.columnStatus")}
            </th>
            <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
              {t("approvals.columnActions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application, index) => (
            <ApplicationRow
              key={application.id}
              application={application}
              isActive={index === activeIndex}
              onNext={handleNext}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
