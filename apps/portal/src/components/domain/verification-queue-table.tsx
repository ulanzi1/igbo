"use client";

import { useTranslations } from "next-intl";
import { useFormatter } from "next-intl";
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
import { Link } from "@/i18n/navigation";
import type { VerificationQueueItem } from "@igbo/db/queries/portal-employer-verifications";

interface VerificationQueueTableProps {
  items: VerificationQueueItem[];
}

const STATUS_BADGE: Record<string, string> = {
  pending: "border-amber-500 text-amber-700",
  approved: "border-green-500 text-green-700",
  rejected: "border-red-500 text-red-700",
};

const STATUS_KEY: Record<string, string> = {
  pending: "verificationsPending",
  approved: "verificationsApproved",
  rejected: "verificationsRejected",
};

export function VerificationQueueTable({ items }: VerificationQueueTableProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();

  const formatDate = (d: Date) =>
    format.dateTime(new Date(d), { year: "numeric", month: "short", day: "numeric" });

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-queue">
        {t("verificationsEmpty")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("verificationsCompany")}</TableHead>
          <TableHead scope="col">{t("verificationsEmployer")}</TableHead>
          <TableHead scope="col">{t("verificationsSubmittedAt")}</TableHead>
          <TableHead scope="col">{t("verificationsDocuments")}</TableHead>
          <TableHead scope="col">{t("verificationsStatus")}</TableHead>
          <TableHead scope="col">{t("verificationsActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} data-testid="queue-row">
            <TableCell className="font-medium">{item.companyName}</TableCell>
            <TableCell>{item.ownerUserName}</TableCell>
            <TableCell>{formatDate(item.submittedAt)}</TableCell>
            <TableCell>{item.documentCount}</TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={`text-xs ${STATUS_BADGE[item.status] ?? "border-gray-400 text-muted-foreground"}`}
                data-testid="status-badge"
              >
                {t(STATUS_KEY[item.status] ?? "verificationsPending")}
              </Badge>
            </TableCell>
            <TableCell>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/admin/verifications/${item.id}`}
                  aria-label={`${t("verificationsReview")} ${item.companyName}`}
                >
                  {t("verificationsReview")}
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
