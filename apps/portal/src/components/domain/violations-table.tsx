"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { ResolveFlagModal } from "./resolve-flag-modal";
import type { OpenFlagWithContext } from "@igbo/db/queries/portal-admin-flags";

interface ViolationsTableProps {
  items: OpenFlagWithContext[];
  locale: string;
  onResolved: () => void;
}

function severityBadgeClass(severity: string): string {
  return (
    {
      high: "border-red-500 text-red-700",
      medium: "border-amber-500 text-amber-700",
      low: "border-blue-400 text-blue-700",
    }[severity as "high" | "medium" | "low"] ?? ""
  );
}

function useCategoryLabel() {
  const t = useTranslations("Portal.admin");
  return (c: string) => {
    const map: Record<string, string> = {
      misleading_content: t("categoryMisleadingContent"),
      discriminatory_language: t("categoryDiscriminatoryLanguage"),
      scam_fraud: t("categoryScamFraud"),
      terms_of_service_violation: t("categoryTermsOfServiceViolation"),
      other: t("categoryOther"),
    };
    return map[c] ?? c;
  };
}

function useSeverityLabel() {
  const t = useTranslations("Portal.admin");
  return (s: string) => {
    const map: Record<string, string> = {
      high: t("severityHigh"),
      medium: t("severityMedium"),
      low: t("severityLow"),
    };
    return map[s] ?? s;
  };
}

export function ViolationsTable({ items, locale, onResolved }: ViolationsTableProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();
  const router = useRouter();
  const categoryLabel = useCategoryLabel();
  const severityLabel = useSeverityLabel();
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<OpenFlagWithContext | null>(null);

  const formatDate = (d: Date) => format.dateTime(new Date(d), { dateStyle: "medium" });

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="violations-empty">
        {t("violationsEmpty")}
      </p>
    );
  }

  return (
    <>
      <Table aria-label={t("violationsTitle")} data-testid="violations-table">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("violationsPostingTitle")}</TableHead>
            <TableHead scope="col">{t("violationsCategory")}</TableHead>
            <TableHead scope="col">{t("violationsSeverity")}</TableHead>
            <TableHead scope="col">{t("violationsFlaggedAt")}</TableHead>
            <TableHead scope="col">{t("violationsActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} data-testid={`violation-row-${item.id}`}>
              <TableCell className="font-medium">{item.postingTitle}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {categoryLabel(item.category)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-xs ${severityBadgeClass(item.severity)}`}
                  aria-label={`${t("violationsSeverity")}: ${severityLabel(item.severity)}`}
                  data-testid={`severity-badge-${item.id}`}
                >
                  {severityLabel(item.severity)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(item.createdAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    aria-label={`${t("violationsViewPosting")} ${item.postingTitle}`}
                  >
                    <Link href={`/${locale}/admin/jobs/${item.postingId}/review`}>
                      {t("violationsViewPosting")}
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedFlag(item);
                      setResolveModalOpen(true);
                    }}
                    aria-label={`${t("resolveFlag")} — ${item.postingTitle}`}
                    data-testid={`resolve-btn-${item.id}`}
                  >
                    {t("resolveFlag")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedFlag && (
        <ResolveFlagModal
          flagId={selectedFlag.id}
          postingTitle={selectedFlag.postingTitle}
          open={resolveModalOpen}
          onOpenChange={(open) => {
            setResolveModalOpen(open);
            if (!open) setSelectedFlag(null);
          }}
          onSuccess={() => {
            setResolveModalOpen(false);
            setSelectedFlag(null);
            onResolved();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

export function ViolationsTableSkeleton() {
  return null;
}
