"use client";

import { useApplications } from "@/features/admin/hooks/use-approvals";

interface QueueSummaryCardProps {
  status: string;
  label: string;
  colorClass: string;
}

export function QueueSummaryCard({ status, label, colorClass }: QueueSummaryCardProps) {
  const { data, isPending } = useApplications(status);
  const count = data?.meta.total ?? 0;

  return (
    <div className={`rounded-lg border border-zinc-700 bg-zinc-800 p-4 ${colorClass}`}>
      <div className="text-sm text-zinc-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{isPending ? "—" : count}</div>
    </div>
  );
}
