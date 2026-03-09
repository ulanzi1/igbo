"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";

interface AuditLogRow {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  targetUserId: string | null;
  targetType: string | null;
  traceId: string | null;
  details: unknown;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ACTION_TYPES = [
  "APPROVE_APPLICATION",
  "REQUEST_INFO",
  "REJECT_APPLICATION",
  "UNDO_ACTION",
  "RESET_2FA",
  "MEMBER_TIER_CHANGED",
  "RECORDING_LOST",
  "RECORDING_EXPIRED_CLEANUP",
  "FLAG_CONTENT",
  "UNFLAG_CONTENT",
  "HIDE_CONTENT",
  "UNHIDE_CONTENT",
  "WARN_MEMBER",
  "SUSPEND_MEMBER",
  "BAN_MEMBER",
  "LIFT_SUSPENSION",
  "VIEW_DISPUTE_CONVERSATION",
  "BADGE_ASSIGNED",
  "BADGE_REVOKED",
  "SETTINGS_UPDATED",
  "GOVERNANCE_CREATED",
  "GOVERNANCE_PUBLISHED",
  "GOVERNANCE_UPDATED",
  "ARTICLE_REJECTED",
  "ARTICLE_REVISION_REQUESTED",
];

const TARGET_TYPES = ["user", "article", "post", "group", "governance_document", "event"];

export function AuditLogTable() {
  const t = useTranslations("Admin.auditLog");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "20");
  if (action) params.set("action", action);
  if (targetType) params.set("targetType", targetType);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading, isError } = useQuery<AuditLogsResponse>({
    queryKey: ["admin", "audit-log", page, action, targetType, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/audit-log?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load audit logs");
      const json = await res.json();
      return json.data as AuditLogsResponse;
    },
  });

  function handleFilterChange() {
    setPage(1);
  }

  return (
    <div>
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">{t("filterAction")}</label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              handleFilterChange();
            }}
          >
            <option value="">{t("allActions")}</option>
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("filterTargetType")}</label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              handleFilterChange();
            }}
          >
            <option value="">{t("allTargetTypes")}</option>
            {TARGET_TYPES.map((tt) => (
              <option key={tt} value={tt}>
                {tt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("filterDateFrom")}</label>
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              handleFilterChange();
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("filterDateTo")}</label>
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              handleFilterChange();
            }}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading && <p className="text-muted-foreground">{t("loading")}</p>}
      {isError && <p className="text-destructive">{t("error")}</p>}
      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t("colTimestamp")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("colAdmin")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("colAction")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("colTargetType")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("colTargetId")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("colDetails")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("colTraceId")}</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                      {new Date(log.createdAt).toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-4 py-3">{log.actorName ?? log.actorId}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3">{log.targetType ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs truncate max-w-[120px]">
                      {log.targetUserId ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs truncate max-w-[160px]">
                      {log.details ? JSON.stringify(log.details).slice(0, 80) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs truncate max-w-[100px]">
                      {log.traceId ?? "—"}
                    </td>
                  </tr>
                ))}
                {data.logs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      {t("empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t("pagination", { page: data.page, total: data.totalPages })}
              </p>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded border text-sm disabled:opacity-50"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("prev")}
                </button>
                <button
                  className="px-3 py-1 rounded border text-sm disabled:opacity-50"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
