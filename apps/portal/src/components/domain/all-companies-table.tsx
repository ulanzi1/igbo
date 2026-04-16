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
import { CheckCircle2 } from "lucide-react";
import type {
  AdminCompanyRow,
  AdminCompaniesListResult,
  VerificationDisplayStatus,
} from "@igbo/db/queries/portal-admin-all-companies";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

function getVerificationVariant(status: VerificationDisplayStatus): BadgeVariant {
  switch (status) {
    case "verified":
      return "default";
    case "pending":
      return "secondary";
    case "rejected":
      return "destructive";
    case "unverified":
      return "outline";
  }
}

interface AllCompaniesTableProps {
  initialCompanies: AdminCompanyRow[];
  initialTotal: number;
}

export function AllCompaniesTable({ initialCompanies, initialTotal }: AllCompaniesTableProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();
  const locale = useLocale();
  const { density } = useDensity();
  const densityClass = DENSITY_STYLES[density];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [companies, setCompanies] = useState(initialCompanies);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const isInitialMount = useRef(true);

  const page = parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10) || 20;
  const verificationFilter = searchParams.get("verification") ?? "";

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
    fetch(`/api/v1/admin/companies?${params.toString()}`)
      .then((res) => res.json())
      .then((body: { data: AdminCompaniesListResult }) => {
        setCompanies(body.data.companies);
        setTotal(body.data.total);
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => setIsLoading(false));
  }, [searchParams]);

  function handleClearFilters() {
    router.push(pathname);
  }

  function handleRowClick(companyId: string) {
    router.push(`/${locale}/admin/postings?companyId=${companyId}`);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, companyId: string) {
    if (e.key === "Enter") {
      handleRowClick(companyId);
    }
  }

  function getVerificationLabel(status: VerificationDisplayStatus): string {
    switch (status) {
      case "verified":
        return t("employersStatusVerified");
      case "pending":
        return t("employersStatusPending");
      case "rejected":
        return t("employersStatusRejected");
      case "unverified":
        return t("employersStatusUnverified");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={cn(densityClass)}>
      {/* Filters */}
      <div
        className="mb-4 flex flex-wrap items-end gap-3"
        role="search"
        aria-label={t("employersTitle")}
      >
        {/* Verification filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="verification-filter" className="text-xs text-muted-foreground">
            {t("employersFilterVerification")}
          </label>
          <Select
            value={verificationFilter || "__all__"}
            onValueChange={(val) =>
              updateParams({ verification: val === "__all__" ? null : val, page: "1" })
            }
          >
            <SelectTrigger
              id="verification-filter"
              className="h-8 w-44 text-xs"
              aria-label={t("employersFilterVerification")}
            >
              <SelectValue placeholder={t("employersFilterAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("employersFilterAll")}</SelectItem>
              <SelectItem value="verified">{t("employersStatusVerified")}</SelectItem>
              <SelectItem value="pending">{t("employersStatusPending")}</SelectItem>
              <SelectItem value="rejected">{t("employersStatusRejected")}</SelectItem>
              <SelectItem value="unverified">{t("employersStatusUnverified")}</SelectItem>
            </SelectContent>
          </Select>
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
          {t("employersFetchError")}
        </div>
      )}

      {/* Table or empty state */}
      {companies.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">{t("employersEmptyState")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("employersEmptyStateDescription")}
          </p>
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="mt-4">
            {t("clearFilters")}
          </Button>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("employersCompanyName")}</TableHead>
                <TableHead>{t("employersOwner")}</TableHead>
                <TableHead>{t("employersVerification")}</TableHead>
                <TableHead>{t("employersActivePostings")}</TableHead>
                <TableHead>{t("employersOpenViolations")}</TableHead>
                <TableHead>{t("employersMemberSince")}</TableHead>
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
                        <Skeleton className="h-4 w-12" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    </TableRow>
                  ))
                : companies.map((company) => (
                    <TableRow
                      key={company.id}
                      className="cursor-pointer"
                      onClick={() => handleRowClick(company.id)}
                      onKeyDown={(e) => handleRowKeyDown(e, company.id)}
                      tabIndex={0}
                      aria-label={t("employersViewPostings", { company: company.name })}
                    >
                      {/* Company name + trust badge */}
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1">
                          {company.name}
                          {company.trustBadge && (
                            <CheckCircle2
                              className="size-4 text-green-600"
                              aria-label={t("verifiedEmployer")}
                            />
                          )}
                        </span>
                      </TableCell>

                      {/* Owner */}
                      <TableCell>{company.ownerName ?? "—"}</TableCell>

                      {/* Verification status badge */}
                      <TableCell>
                        <Badge variant={getVerificationVariant(company.verificationDisplayStatus)}>
                          {getVerificationLabel(company.verificationDisplayStatus)}
                        </Badge>
                      </TableCell>

                      {/* Active posting count */}
                      <TableCell>{company.activePostingCount}</TableCell>

                      {/* Open violation count */}
                      <TableCell>
                        {company.openViolationCount > 0 ? (
                          <a
                            href={`/${locale}/admin/violations?companyId=${company.id}`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t("viewCompanyViolations", { company: company.name })}
                            data-testid={`violation-count-link-${company.id}`}
                          >
                            <Badge variant="destructive">{company.openViolationCount}</Badge>
                          </a>
                        ) : (
                          <span>0</span>
                        )}
                      </TableCell>

                      {/* Registration date */}
                      <TableCell className="text-sm text-muted-foreground">
                        {format.dateTime(new Date(company.createdAt), { dateStyle: "medium" })}
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
