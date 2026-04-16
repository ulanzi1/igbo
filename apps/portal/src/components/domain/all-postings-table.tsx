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
import { Skeleton } from "@/components/ui/skeleton";
import { useDensity, DENSITY_STYLES } from "@/providers/density-context";
import { cn } from "@/lib/utils";
import type {
  AdminPostingRow,
  AdminPostingsListResult,
  CompanyForFilter,
} from "@igbo/db/queries/portal-admin-all-postings";

// Keep in sync with portalJobStatusEnum (can't import server-only from a client component)
const JOB_STATUS_VALUES = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "filled",
  "expired",
  "rejected",
] as const;

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

function getStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "active":
      return "default";
    case "pending_review":
      return "secondary";
    case "paused":
      return "outline";
    case "rejected":
      return "destructive";
    case "expired":
      return "secondary";
    case "filled":
      return "default";
    case "draft":
      return "outline";
    default:
      return "outline";
  }
}

interface AllPostingsTableProps {
  initialPostings: AdminPostingRow[];
  initialTotal: number;
  companies: CompanyForFilter[];
}

export function AllPostingsTable({
  initialPostings,
  initialTotal,
  companies,
}: AllPostingsTableProps) {
  const t = useTranslations("Portal.admin");
  const tPostingType = useTranslations("Portal.posting.type");
  const format = useFormatter();
  const locale = useLocale();
  const { density } = useDensity();
  const densityClass = DENSITY_STYLES[density];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [postings, setPostings] = useState(initialPostings);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const isInitialMount = useRef(true);

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const statusFilter = searchParams.get("status") ?? "";
  const companyFilter = searchParams.get("companyId") ?? "";
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
      const paramStr = params.toString();
      router.push(`${pathname}${paramStr ? `?${paramStr}` : ""}`);
    },
    [searchParams, pathname, router],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setIsLoading(true);
    setFetchError(false);
    const params = new URLSearchParams(searchParams.toString());
    fetch(`/api/v1/admin/postings?${params.toString()}`)
      .then((res) => res.json())
      .then((body: { data: AdminPostingsListResult }) => {
        setPostings(body.data.postings);
        setTotal(body.data.total);
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => setIsLoading(false));
  }, [searchParams]);

  function handleClearFilters() {
    const params = new URLSearchParams();
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleRowClick(postingId: string) {
    router.push(`/${locale}/admin/jobs/${postingId}/review`);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, postingId: string) {
    if (e.key === "Enter") {
      handleRowClick(postingId);
    }
  }

  function getEmploymentTypeLabel(type: string): string {
    try {
      return tPostingType(type as never);
    } catch {
      return type;
    }
  }

  function getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: t("statusDraft"),
      pending_review: t("statusPendingReview"),
      active: t("statusActive"),
      paused: t("statusPaused"),
      filled: t("statusFilled"),
      expired: t("statusExpired"),
      rejected: t("statusRejected"),
    };
    return map[status] ?? status;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={cn(densityClass)}>
      {/* Filters */}
      <div
        className="mb-4 flex flex-wrap items-end gap-3"
        role="search"
        aria-label={t("allPostingsTitle")}
      >
        {/* Status filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter" className="text-xs text-muted-foreground">
            {t("postingsFilterStatus")}
          </label>
          <Select
            value={statusFilter || "__all__"}
            onValueChange={(val) =>
              updateParams({ status: val === "__all__" ? null : val, page: "1" })
            }
          >
            <SelectTrigger
              id="status-filter"
              className="h-8 w-44 text-xs"
              aria-label={t("postingsFilterStatus")}
            >
              <SelectValue placeholder={t("postingsFilterAllStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("postingsFilterAllStatuses")}</SelectItem>
              {JOB_STATUS_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {getStatusLabel(s)}
                </SelectItem>
              ))}
              <SelectItem value="archived">{t("postingsFilterArchived")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Company filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="company-filter" className="text-xs text-muted-foreground">
            {t("postingsFilterCompany")}
          </label>
          <Select
            value={companyFilter || "__all__"}
            onValueChange={(val) =>
              updateParams({ companyId: val === "__all__" ? null : val, page: "1" })
            }
          >
            <SelectTrigger
              id="company-filter"
              className="h-8 w-44 text-xs"
              aria-label={t("postingsFilterCompany")}
            >
              <SelectValue placeholder={t("postingsFilterAllCompanies")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("postingsFilterAllCompanies")}</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label htmlFor="date-from" className="text-xs text-muted-foreground">
            {t("postingsFilterDateFrom")}
          </label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value || null, page: "1" })}
            className="h-8 w-36 text-xs"
            aria-label={t("postingsFilterDateFrom")}
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label htmlFor="date-to" className="text-xs text-muted-foreground">
            {t("postingsFilterDateTo")}
          </label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value || null, page: "1" })}
            className="h-8 w-36 text-xs"
            aria-label={t("postingsFilterDateTo")}
          />
        </div>

        {/* Clear filters */}
        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-8 text-xs">
          {t("clearFilters")}
        </Button>
      </div>

      {/* Fetch error banner */}
      {fetchError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t("postingsFetchError")}
        </div>
      )}

      {/* Table */}
      {postings.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">{t("postingsEmptyState")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("postingsEmptyStateDescription")}</p>
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="mt-4">
            {t("clearFilters")}
          </Button>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("postingTitle")}</TableHead>
                <TableHead>{t("postingCompany")}</TableHead>
                <TableHead>{t("postingEmployer")}</TableHead>
                <TableHead>{t("postingStatus")}</TableHead>
                <TableHead>{t("postingLocation")}</TableHead>
                <TableHead>{t("postingType")}</TableHead>
                <TableHead>{t("postingCreatedAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    </TableRow>
                  ))
                : postings.map((posting) => (
                    <TableRow
                      key={posting.id}
                      className="cursor-pointer"
                      onClick={() => handleRowClick(posting.id)}
                      onKeyDown={(e) => handleRowKeyDown(e, posting.id)}
                      tabIndex={0}
                      aria-label={t("viewPosting", { title: posting.title })}
                    >
                      <TableCell className="font-medium">{posting.title}</TableCell>
                      <TableCell>
                        <a
                          href={`/${locale}/admin/employers`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                          aria-label={t("viewCompanyPostings", { company: posting.companyName })}
                          data-testid={`company-link-${posting.id}`}
                        >
                          {posting.companyName}
                        </a>
                        {posting.companyTrustBadge && (
                          <Badge
                            variant="outline"
                            className="ml-1 border-green-500 text-green-700 text-xs"
                            aria-label={t("verifiedEmployer")}
                          >
                            ✓
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{posting.employerName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={getStatusVariant(posting.status)}>
                            {getStatusLabel(posting.status)}
                          </Badge>
                          {posting.archivedAt !== null && (
                            <Badge variant="outline">{t("statusArchived")}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{posting.location ?? "—"}</TableCell>
                      <TableCell>{getEmploymentTypeLabel(posting.employmentType)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format.dateTime(new Date(posting.createdAt), { dateStyle: "medium" })}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span aria-live="polite">
              {t("showing")} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}{" "}
              {t("of")} {total} {t("results")}
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
    </div>
  );
}
