"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useFormatter, useLocale } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationStatusBadge } from "@/components/domain/application-status-badge";
import {
  EMPLOYER_STATUS_GROUP_KEYS,
  EMPLOYER_SORT_WHITELIST,
  DEFAULT_PAGE_SIZE,
} from "@/lib/employer-application-constants";
import type { EmployerApplicationRow } from "@igbo/db/queries/portal-applications";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";

const FILTER_TABS = ["all", ...EMPLOYER_STATUS_GROUP_KEYS] as const;

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface EmployerApplicationsTableProps {
  initialApplications: EmployerApplicationRow[];
  initialTotal: number;
}

export function EmployerApplicationsTable({
  initialApplications,
  initialTotal,
}: EmployerApplicationsTableProps) {
  const t = useTranslations("Portal.employerApplications");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [applications, setApplications] = useState(initialApplications);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const isInitialMount = useRef(true);

  const statusFilter = searchParams.get("status") ?? "all";
  const sortBy = searchParams.get("sortBy") ?? "appliedDate";
  const sortOrder = searchParams.get("sortOrder") ?? "desc";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);

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
      const paramStr = params.toString();
      router.push(`${pathname}${paramStr ? `?${paramStr}` : ""}`);
    },
    [searchParams, pathname, router],
  );

  const searchParamsString = searchParams.toString();

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setFetchError(false);
    fetch(`/api/v1/applications?${searchParamsString}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((body: { data: { applications: EmployerApplicationRow[]; total: number } }) => {
        setApplications(body.data.applications);
        setTotal(body.data.total);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setFetchError(true);
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [searchParamsString]);

  const filterLabel: Record<string, string> = {
    all: t("filterAll"),
    new: t("filterNew"),
    inReview: t("filterInReview"),
    interview: t("filterInterview"),
    offered: t("filterOffered"),
    closed: t("filterClosed"),
  };

  function handleSort(column: string) {
    if (!EMPLOYER_SORT_WHITELIST.includes(column as (typeof EMPLOYER_SORT_WHITELIST)[number]))
      return;
    if (sortBy === column) {
      updateParams({ sortOrder: sortOrder === "asc" ? "desc" : "asc", page: "1" });
    } else {
      updateParams({ sortBy: column, sortOrder: "desc", page: "1" });
    }
  }

  function renderSortIcon(column: string) {
    if (sortBy !== column) return null;
    return sortOrder === "asc" ? (
      <ArrowUpIcon className="ml-1 inline size-3" aria-label={t("sortAsc")} />
    ) : (
      <ArrowDownIcon className="ml-1 inline size-3" aria-label={t("sortDesc")} />
    );
  }

  function handleRowClick(jobId: string) {
    router.push(`/${locale}/my-jobs/${jobId}/candidates`);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, jobId: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick(jobId);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <div>
      {/* Filter tabs */}
      <nav aria-label={t("filterLabel")} className="mb-6 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => updateParams({ status: tab === "all" ? null : tab, page: "1" })}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              statusFilter === tab || (tab === "all" && statusFilter === "all")
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-accent"
            }`}
            aria-current={
              statusFilter === tab || (tab === "all" && !searchParams.get("status"))
                ? "page"
                : undefined
            }
            data-testid={`filter-tab-${tab}`}
          >
            {filterLabel[tab] ?? tab}
          </button>
        ))}
      </nav>

      {/* Error banner */}
      {fetchError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t("fetchError")}
        </div>
      )}

      {/* Empty state */}
      {total === 0 && !isLoading ? (
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          data-testid="empty-state"
        >
          <p className="text-lg font-medium text-muted-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyCta")}</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => handleSort("applicantName")}
                    className="inline-flex items-center"
                  >
                    {t("columnApplicant")}
                    {renderSortIcon("applicantName")}
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    type="button"
                    onClick={() => handleSort("jobTitle")}
                    className="inline-flex items-center"
                  >
                    {t("columnJobTitle")}
                    {renderSortIcon("jobTitle")}
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => handleSort("status")}
                    className="inline-flex items-center"
                  >
                    {t("columnStatus")}
                    {renderSortIcon("status")}
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    type="button"
                    onClick={() => handleSort("appliedDate")}
                    className="inline-flex items-center"
                  >
                    {t("columnAppliedDate")}
                    {renderSortIcon("appliedDate")}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    </TableRow>
                  ))
                : applications.map((app) => (
                    <TableRow
                      key={app.applicationId}
                      className="cursor-pointer"
                      onClick={() => handleRowClick(app.jobId)}
                      onKeyDown={(e) => handleRowKeyDown(e, app.jobId)}
                      tabIndex={0}
                      role="row"
                      data-testid={`application-row-${app.applicationId}`}
                    >
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {app.applicantName ?? t("unknownApplicant")}
                          </span>
                          {/* Mobile: show job title as secondary line */}
                          <span className="block text-xs text-muted-foreground sm:hidden">
                            <a
                              href={`/${locale}/my-jobs/${app.jobId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              {app.jobTitle ?? "—"}
                            </a>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <a
                          href={`/${locale}/my-jobs/${app.jobId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                          data-testid={`job-link-${app.applicationId}`}
                        >
                          {app.jobTitle ?? "—"}
                        </a>
                      </TableCell>
                      <TableCell>
                        <ApplicationStatusBadge status={app.status} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {format.dateTime(new Date(app.createdAt), { dateStyle: "medium" })}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span aria-live="polite" data-testid="showing-count">
              {t("showingCount", { from, to, total })}
            </span>
            <div className="flex items-center gap-2">
              {/* Page size selector */}
              <select
                value={pageSize}
                onChange={(e) => updateParams({ pageSize: e.target.value, page: "1" })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label={t("pageSize")}
                data-testid="page-size-selector"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
                aria-label={t("previousPage")}
                data-testid="prev-page"
              >
                ‹
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
                aria-label={t("nextPage")}
                data-testid="next-page"
              >
                ›
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
