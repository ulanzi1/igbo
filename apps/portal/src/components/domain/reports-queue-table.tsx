"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations, useFormatter } from "next-intl";
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
import type { PostingWithReportCount } from "@igbo/db/queries/portal-posting-reports";

interface ReportsQueueTableProps {
  items: PostingWithReportCount[];
}

function priorityBadgeClass(priority: string): string {
  return (
    {
      urgent: "border-red-500 text-red-700",
      elevated: "border-amber-500 text-amber-700",
      normal: "border-blue-400 text-blue-700",
    }[priority as "urgent" | "elevated" | "normal"] ?? ""
  );
}

export function ReportsQueueTable({ items }: ReportsQueueTableProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();

  const formatDate = (d: Date) => format.dateTime(new Date(d), { dateStyle: "medium" });

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="reports-empty">
        {t("reportsEmpty")}
      </p>
    );
  }

  return (
    <Table aria-label={t("reportsQueueTitle")} data-testid="reports-queue-table">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("reportsPostingTitle")}</TableHead>
          <TableHead scope="col">{t("reportsCompanyName")}</TableHead>
          <TableHead scope="col">{t("reportsCount")}</TableHead>
          <TableHead scope="col">{t("reportsPriority")}</TableHead>
          <TableHead scope="col">{t("reportsLatestAt")}</TableHead>
          <TableHead scope="col">{t("reportsActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.postingId} data-testid={`report-row-${item.postingId}`}>
            <TableCell className="font-medium">{item.postingTitle}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              <Link
                href={`/admin/postings?companyId=${item.companyId}`}
                className="text-primary hover:underline"
                aria-label={t("viewCompanyPostings", { company: item.companyName })}
                data-testid={`company-link-${item.postingId}`}
              >
                {item.companyName}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" data-testid={`report-count-${item.postingId}`}>
                {item.reportCount}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={`text-xs ${priorityBadgeClass(item.priority)}`}
                aria-label={`${t("reportsPriority")}: ${item.priority}`}
                data-testid={`priority-badge-${item.postingId}`}
              >
                {item.priority === "urgent"
                  ? t("reportsPriorityUrgent")
                  : item.priority === "elevated"
                    ? t("reportsPriorityElevated")
                    : t("reportsPriorityNormal")}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(item.latestReportAt)}
            </TableCell>
            <TableCell>
              <Button asChild size="sm" variant="ghost">
                <Link
                  href={`/admin/reports/${item.postingId}`}
                  aria-label={`${t("reportsInvestigate")} ${item.postingTitle}`}
                >
                  {t("reportsInvestigate")}
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ReportsQueueTableSkeleton() {
  return null;
}
