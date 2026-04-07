"use client";

import { useState, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddKeywordModal } from "./add-keyword-modal";
import { EditKeywordModal } from "./edit-keyword-modal";
import { DeleteKeywordConfirmDialog } from "./delete-keyword-confirm-dialog";
import type { PortalScreeningKeyword } from "@igbo/db/schema/portal-screening-keywords";
import type { ScreeningKeywordCategory } from "@igbo/db/schema/portal-screening-keywords";

interface KeywordManagerProps {
  initialKeywords: PortalScreeningKeyword[];
  initialTotal: number;
}

export function KeywordManager({ initialKeywords, initialTotal }: KeywordManagerProps) {
  const t = useTranslations("Portal.admin");
  const format = useFormatter();
  const [keywords, setKeywords] = useState(initialKeywords);
  const [total, setTotal] = useState(initialTotal);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PortalScreeningKeyword | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalScreeningKeyword | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/screening/keywords?limit=100&offset=0");
      if (res.ok) {
        const body = await res.json();
        setKeywords(body.data.items ?? []);
        setTotal(body.data.total ?? 0);
      }
    } catch {
      // silent — stale list is better than breaking the UI
    }
  }, []);

  function categoryLabel(cat: string): string {
    const map: Record<ScreeningKeywordCategory, string> = {
      discriminatory: t("blocklistCategoryDiscriminatory"),
      illegal: t("blocklistCategoryIllegal"),
      scam: t("blocklistCategoryScam"),
      other: t("blocklistCategoryOther"),
    };
    return map[cat as ScreeningKeywordCategory] ?? cat;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} {t("results")}
        </p>
        <Button onClick={() => setAddOpen(true)} data-testid="add-keyword-button">
          {t("blocklistAdd")}
        </Button>
      </div>

      {keywords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground" data-testid="empty-state">
            {t("blocklistEmpty")}
          </p>
        </div>
      ) : (
        <Table aria-label={t("blocklistTitle")}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("blocklistPhrase")}</TableHead>
              <TableHead scope="col">{t("blocklistCategory")}</TableHead>
              <TableHead scope="col">{t("blocklistNotes")}</TableHead>
              <TableHead scope="col">{t("blocklistCreatedAt")}</TableHead>
              <TableHead scope="col">
                <span className="sr-only">{t("blocklistActions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keywords.map((kw) => (
              <TableRow key={kw.id} data-testid={`keyword-row-${kw.id}`}>
                <TableCell className="font-mono text-sm">{kw.phrase}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {categoryLabel(kw.category)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                  {kw.notes ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format.dateTime(new Date(kw.createdAt), { dateStyle: "medium" })}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditTarget(kw)}
                      aria-label={`${t("blocklistEdit")} ${kw.phrase}`}
                      data-testid={`edit-keyword-${kw.id}`}
                    >
                      {t("blocklistEdit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(kw)}
                      aria-label={`${t("blocklistDelete")} ${kw.phrase}`}
                      data-testid={`delete-keyword-${kw.id}`}
                    >
                      {t("blocklistDelete")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddKeywordModal open={addOpen} onOpenChange={setAddOpen} onSuccess={refetch} />

      <EditKeywordModal
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSuccess={refetch}
        keyword={editTarget}
      />

      <DeleteKeywordConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onSuccess={refetch}
        keyword={deleteTarget}
      />
    </div>
  );
}

export function KeywordManagerSkeleton() {
  return (
    <div className="w-full">
      <div className="mb-4 flex justify-end">
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3">
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
