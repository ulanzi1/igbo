"use client";

import { useTranslations, useFormatter } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDensity, DENSITY_STYLES } from "@/providers/density-context";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";
import type { ReviewQueueItem, ConfidenceIndicatorData } from "@/services/admin-review-service";
import { FailedScreeningBadge } from "./failed-screening-badge";

interface ConfidenceIndicatorProps {
  indicator: ConfidenceIndicatorData;
}

function ConfidenceIndicator({ indicator }: ConfidenceIndicatorProps) {
  const t = useTranslations("Portal.admin");

  const colorMap: Record<"high" | "medium" | "low", string> = {
    high: "bg-green-500",
    medium: "bg-amber-500",
    low: "bg-red-500",
  };

  const labelMap: Record<"high" | "medium" | "low", string> = {
    high: t("highConfidence"),
    medium: t("mediumConfidence"),
    low: t("lowConfidence"),
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full",
              colorMap[indicator.level],
            )}
            aria-label={labelMap[indicator.level]}
            role="img"
          />
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1 text-xs">
            <span>{indicator.verifiedEmployer ? t("verified") : t("unverified")}</span>
            <span>
              {t("violations")}: {indicator.violationCount}
            </span>
            <span>
              {t("reports")}: {indicator.reportCount}
            </span>
            <span>
              {t("engagement")}: {indicator.engagementLevel}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface FilterBarProps {
  verifiedOnly: boolean;
  onVerifiedOnlyChange: (value: boolean) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  minRevisionCount: string;
  onMinRevisionCountChange: (value: string) => void;
  onClearFilters: () => void;
}

function FilterBar({
  verifiedOnly,
  onVerifiedOnlyChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  minRevisionCount,
  onMinRevisionCountChange,
  onClearFilters,
}: FilterBarProps) {
  const t = useTranslations("Portal.admin");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={verifiedOnly}
          onChange={(e) => onVerifiedOnlyChange(e.target.checked)}
          className="h-4 w-4"
          aria-label={t("filterByVerification")}
        />
        {t("filterByVerification")}
      </label>

      <div className="flex items-center gap-1">
        <label htmlFor="dateFrom" className="text-xs text-muted-foreground">
          {t("filterByDate")} (from)
        </label>
        <Input
          id="dateFrom"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-7 w-36 text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-7 w-36 text-xs"
          aria-label={`${t("filterByDate")} to`}
        />
      </div>

      <div className="flex items-center gap-1">
        <label htmlFor="minRevisions" className="text-xs text-muted-foreground">
          {t("filterByRevisions")}
        </label>
        <Input
          id="minRevisions"
          type="number"
          min="0"
          value={minRevisionCount}
          onChange={(e) => onMinRevisionCountChange(e.target.value)}
          className="h-7 w-16 text-xs"
        />
      </div>

      <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-7 text-xs">
        {t("clearFilters")}
      </Button>
    </div>
  );
}

interface ReviewQueueTableProps {
  initialItems: ReviewQueueItem[];
  initialTotal: number;
}

export function ReviewQueueTable({ initialItems, initialTotal }: ReviewQueueTableProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();
  const { density } = useDensity();
  const densityClass = DENSITY_STYLES[density];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const verifiedOnly = searchParams.get("verifiedOnly") === "true";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const minRevisionCount = searchParams.get("minRevisionCount") ?? "";

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

  function handleClearFilters() {
    const params = new URLSearchParams();
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  const totalPages = Math.max(1, Math.ceil(initialTotal / pageSize));

  return (
    <div className={cn(densityClass)}>
      <FilterBar
        verifiedOnly={verifiedOnly}
        onVerifiedOnlyChange={(val) =>
          updateParams({ verifiedOnly: val ? "true" : null, page: "1" })
        }
        dateFrom={dateFrom}
        onDateFromChange={(val) => updateParams({ dateFrom: val || null, page: "1" })}
        dateTo={dateTo}
        onDateToChange={(val) => updateParams({ dateTo: val || null, page: "1" })}
        minRevisionCount={minRevisionCount}
        onMinRevisionCountChange={(val) =>
          updateParams({ minRevisionCount: val || null, page: "1" })
        }
        onClearFilters={handleClearFilters}
      />

      {initialItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">{t("emptyQueue")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyQueueDescription")}</p>
        </div>
      ) : (
        <>
          <Table aria-label={t("reviewQueue")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("title")}</TableHead>
                <TableHead>{t("company")}</TableHead>
                <TableHead>{t("employer")}</TableHead>
                <TableHead>{t("submitted")}</TableHead>
                <TableHead>{t("revisionCount")}</TableHead>
                <TableHead>{t("confidence")}</TableHead>
                <TableHead>{t("screening")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialItems.map((item) => (
                <TableRow
                  key={item.posting.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/${locale}/admin/jobs/${item.posting.id}/review`)}
                  aria-label={`Review ${item.posting.title}`}
                >
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{item.posting.title}</span>
                      {item.isFirstTimeEmployer && (
                        <Badge
                          variant="outline"
                          className="w-fit border-amber-500 text-amber-600 text-xs"
                        >
                          {t("firstTimeEmployer")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`/${locale}/admin/postings?companyId=${item.company.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline"
                      aria-label={t("viewCompanyPostings", { company: item.company.name })}
                      data-testid={`company-link-${item.posting.id}`}
                    >
                      {item.company.name}
                    </a>
                  </TableCell>
                  <TableCell>{item.employerName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format.dateTime(item.posting.createdAt, {
                      dateStyle: "medium",
                    })}
                  </TableCell>
                  <TableCell>{item.posting.revisionCount}</TableCell>
                  <TableCell>
                    <ConfidenceIndicator indicator={item.confidenceIndicator} />
                  </TableCell>
                  <TableCell>
                    <FailedScreeningBadge screeningResult={item.screeningResult} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {t("showing")} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, initialTotal)}{" "}
              {t("of")} {initialTotal} {t("results")}
            </span>
            <div className="flex gap-2">
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

export function ReviewQueueTableSkeleton() {
  return (
    <div className="w-full">
      <div className="mb-4 flex gap-3">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3">
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
