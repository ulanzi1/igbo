"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditLogRow, PaginatedAuditLogs } from "@igbo/db/queries/audit-logs";

// Keep in sync with PORTAL_AUDIT_ACTIONS in @igbo/db (can't import server-only from a client component)
const PORTAL_AUDIT_ACTIONS = [
  "portal.posting.approve",
  "portal.posting.reject",
  "portal.posting.request_changes",
  "portal.flag.create",
  "portal.flag.resolve",
  "portal.flag.dismiss",
  "portal.report.submit",
  "portal.report.resolve",
  "portal.report.dismiss",
  "portal.verification.submit",
  "portal.verification.approve",
  "portal.verification.reject",
  "portal.blocklist.add",
  "portal.blocklist.update",
  "portal.blocklist.delete",
] as const;
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

const TARGET_TYPES = [
  "portal_job_posting",
  "portal_admin_flag",
  "portal_posting_report",
  "portal_screening_keyword",
  "portal_employer_verification",
] as const;

const ACTION_LABEL_MAP: Record<string, string> = {
  "portal.posting.approve": "auditActionPostingApprove",
  "portal.posting.reject": "auditActionPostingReject",
  "portal.posting.request_changes": "auditActionPostingRequestChanges",
  "portal.flag.create": "auditActionFlagCreate",
  "portal.flag.resolve": "auditActionFlagResolve",
  "portal.flag.dismiss": "auditActionFlagDismiss",
  "portal.report.submit": "auditActionReportSubmit",
  "portal.report.resolve": "auditActionReportResolve",
  "portal.report.dismiss": "auditActionReportDismiss",
  "portal.verification.submit": "auditActionVerificationSubmit",
  "portal.verification.approve": "auditActionVerificationApprove",
  "portal.verification.reject": "auditActionVerificationReject",
  "portal.blocklist.add": "auditActionBlocklistAdd",
  "portal.blocklist.update": "auditActionBlocklistUpdate",
  "portal.blocklist.delete": "auditActionBlocklistDelete",
};

const TARGET_TYPE_LABEL_MAP: Record<string, string> = {
  portal_job_posting: "auditTargetPosting",
  portal_admin_flag: "auditTargetFlag",
  portal_posting_report: "auditTargetReport",
  portal_screening_keyword: "auditTargetBlocklist",
  portal_employer_verification: "auditTargetVerification",
};

function extractSummary(action: string, details: unknown): string {
  const d = (details as Record<string, unknown>) ?? {};
  if (action.startsWith("portal.posting.")) {
    return `Posting ${(d.postingId as string) ?? ""}`;
  }
  if (action.startsWith("portal.flag.")) {
    const cat = d.category ? ` — ${d.category}` : "";
    return `Flag on posting ${(d.postingId as string) ?? ""}${cat}`;
  }
  if (action.startsWith("portal.report.")) {
    return `Report on posting ${(d.postingId as string) ?? ""}`;
  }
  if (action.startsWith("portal.verification.")) {
    return `Company ${(d.companyId as string) ?? ""}`;
  }
  if (action.startsWith("portal.blocklist.")) {
    return `Keyword: ${(d.phrase as string) ?? (d.keyword as string) ?? ""}`;
  }
  return JSON.stringify(d).slice(0, 100);
}

export interface AuditLogTableProps {
  initialLogs: AuditLogRow[];
  initialTotal: number;
  admins: { id: string; name: string }[];
}

export function AuditLogTable({ initialLogs, initialTotal, admins }: AuditLogTableProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [logs, setLogs] = useState(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const isInitialMount = useRef(true);

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
  const actionFilter = searchParams.get("action") ?? "";
  const actorFilter = searchParams.get("actorId") ?? "";
  const targetTypeFilter = searchParams.get("targetType") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, router],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setIsLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    fetch(`/api/v1/admin/audit-logs?${params.toString()}`)
      .then((res) => res.json())
      .then((body: { data: PaginatedAuditLogs }) => {
        setLogs(body.data.logs);
        setTotal(body.data.total);
      })
      .catch(() => {
        // Silently fail — initial data still shown
      })
      .finally(() => setIsLoading(false));
  }, [searchParams]);

  function handleClearFilters() {
    const params = new URLSearchParams();
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleExpanded(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getActionLabel(action: string): string {
    const key = ACTION_LABEL_MAP[action];
    return key ? t(key) : t("auditActionUnknown");
  }

  function getTargetTypeLabel(targetType: string | null): string {
    if (!targetType) return t("auditTargetUnknown");
    const key = TARGET_TYPE_LABEL_MAP[targetType];
    return key ? t(key) : t("auditTargetUnknown");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const exportParams = new URLSearchParams(searchParams.toString());
  exportParams.delete("page");
  exportParams.delete("pageSize");
  const exportHref = `/api/v1/admin/audit-logs/export${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  return (
    <div>
      {/* Filters */}
      <div
        className="mb-4 flex flex-wrap items-end gap-3"
        role="search"
        aria-label={t("auditLogTitle")}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="action-filter" className="text-xs text-muted-foreground">
            {t("auditFilterAction")}
          </label>
          <Select
            value={actionFilter}
            onValueChange={(val) =>
              updateParams({ action: val === "__all__" ? null : val, page: "1" })
            }
          >
            <SelectTrigger id="action-filter" className="h-8 w-48 text-xs">
              <SelectValue placeholder={t("auditFilterAllActions")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("auditFilterAllActions")}</SelectItem>
              {PORTAL_AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {getActionLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="admin-filter" className="text-xs text-muted-foreground">
            {t("auditFilterAdmin")}
          </label>
          <Select
            value={actorFilter}
            onValueChange={(val) =>
              updateParams({ actorId: val === "__all__" ? null : val, page: "1" })
            }
          >
            <SelectTrigger id="admin-filter" className="h-8 w-40 text-xs">
              <SelectValue placeholder={t("auditFilterAllAdmins")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("auditFilterAllAdmins")}</SelectItem>
              {admins.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="target-filter" className="text-xs text-muted-foreground">
            {t("auditFilterTargetType")}
          </label>
          <Select
            value={targetTypeFilter}
            onValueChange={(val) =>
              updateParams({ targetType: val === "__all__" ? null : val, page: "1" })
            }
          >
            <SelectTrigger id="target-filter" className="h-8 w-44 text-xs">
              <SelectValue placeholder={t("auditFilterAllTargets")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("auditFilterAllTargets")}</SelectItem>
              {TARGET_TYPES.map((tt) => (
                <SelectItem key={tt} value={tt}>
                  {getTargetTypeLabel(tt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="date-from" className="text-xs text-muted-foreground">
            {t("auditFilterDateFrom")}
          </label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value || null, page: "1" })}
            className="h-8 w-36 text-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="date-to" className="text-xs text-muted-foreground">
            {t("auditFilterDateTo")}
          </label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value || null, page: "1" })}
            className="h-8 w-36 text-xs"
          />
        </div>

        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-8 text-xs">
          {t("clearFilters")}
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">{t("auditEmptyState")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("auditEmptyStateDescription")}</p>
        </div>
      ) : (
        <>
          <section aria-label={t("auditLogTitle")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <span className="sr-only">{t("auditDetails")}</span>
                  </TableHead>
                  <TableHead>{t("auditTimestamp")}</TableHead>
                  <TableHead>{t("auditAdmin")}</TableHead>
                  <TableHead>{t("auditAction")}</TableHead>
                  <TableHead>{t("auditTargetType")}</TableHead>
                  <TableHead>{t("auditSummary")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`skeleton-${i}`}>
                        <TableCell>
                          <Skeleton className="h-4 w-6" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : logs.map((log) => {
                      const isExpanded = expandedRows.has(log.id);
                      const detailPanelId = `detail-${log.id}`;
                      return (
                        <React.Fragment key={log.id}>
                          <TableRow>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(log.id)}
                                aria-expanded={isExpanded}
                                aria-controls={detailPanelId}
                                aria-label={
                                  isExpanded ? t("auditCollapseDetails") : t("auditExpandDetails")
                                }
                                className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="size-4" aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="size-4" aria-hidden="true" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {format.dateTime(new Date(log.createdAt), {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </TableCell>
                            <TableCell>{log.actorName ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{getActionLabel(log.action)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {getTargetTypeLabel(log.targetType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                              {extractSummary(log.action, log.details)}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <div
                                  id={detailPanelId}
                                  className="rounded bg-muted p-4 text-sm font-mono"
                                >
                                  <pre className="whitespace-pre-wrap break-all">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
              </TableBody>
            </Table>
          </section>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span aria-live="polite">
              {t("auditShowing", {
                from: (page - 1) * pageSize + 1,
                to: Math.min(page * pageSize, total),
                total,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
                aria-label={t("previousPage")}
              >
                ‹
              </Button>
              <span className="flex items-center px-2">
                {t("page")} {page} {t("of")} {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
                aria-label={t("nextPage")}
              >
                ›
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Export button */}
      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" asChild aria-label={t("auditExportCsv")}>
          <a href={exportHref} download>
            <Download className="mr-1.5 size-4" aria-hidden="true" />
            {t("auditExportCsv")}
          </a>
        </Button>
      </div>
    </div>
  );
}
