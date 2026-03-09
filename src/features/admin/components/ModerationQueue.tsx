"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ModerationActionDialog, type DisciplineAction } from "./ModerationActionDialog";

interface DisciplineRecord {
  id: string;
  actionType: "warning" | "suspension" | "ban";
  reason: string;
  createdAt: string;
}

interface ModerationItem {
  id: string;
  contentType: "post" | "article" | "message";
  contentPreview: string | null;
  authorName: string | null;
  contentAuthorId: string;
  flagReason: string;
  keywordMatched: string | null;
  autoFlagged: boolean;
  flaggedAt: string;
  status: "pending" | "reviewed" | "dismissed";
  reportCount: number;
}

interface ModerationResponse {
  data: { items: ModerationItem[] };
  meta: { page: number; pageSize: number; total: number };
}

interface ModerationDetailResponse {
  data: { action: ModerationItem; disciplineHistory: DisciplineRecord[] | null };
}

function highlightKeyword(text: string, keyword: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400 text-black">{text.slice(idx, idx + keyword.length)}</mark>
      {text.slice(idx + keyword.length)}
    </>
  );
}

export function ModerationQueue() {
  const t = useTranslations("Admin");
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [contentType, setContentType] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogItem, setDialogItem] = useState<{
    id: string;
    action: DisciplineAction;
    disciplineHistory?: DisciplineRecord[];
  } | null>(null);

  const queryKey = ["admin", "moderation", { status, contentType, page }];

  const { data, isLoading } = useQuery<ModerationResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status !== "all") params.set("status", status);
      if (contentType !== "all") params.set("contentType", contentType);
      const res = await fetch(`/api/v1/admin/moderation?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch moderation queue");
      return res.json() as Promise<ModerationResponse>;
    },
  });

  const mutation = useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
      durationHours,
      confirmed,
    }: {
      id: string;
      action: string;
      reason?: string;
      durationHours?: number;
      confirmed?: boolean;
    }) => {
      const body: Record<string, unknown> = { action };
      if (reason) body.reason = reason;
      if (durationHours !== undefined) body.durationHours = durationHours;
      if (confirmed !== undefined) body.confirmed = confirmed;
      const res = await fetch(`/api/v1/admin/moderation/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Moderation action failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "moderation"] });
      setDialogItem(null);
    },
  });

  const handleApprove = (id: string) => mutation.mutate({ id, action: "approve" });

  async function openDisciplineDialog(itemId: string, action: DisciplineAction) {
    // Fetch discipline history for this item's author
    try {
      const res = await fetch(`/api/v1/admin/moderation/${itemId}`, { credentials: "include" });
      if (res.ok) {
        const detail = (await res.json()) as ModerationDetailResponse;
        setDialogItem({
          id: itemId,
          action,
          disciplineHistory: detail.data.disciplineHistory ?? undefined,
        });
        return;
      }
    } catch {
      // Fall through to open dialog without history
    }
    setDialogItem({ id: itemId, action });
  }

  const items = data?.data?.items ?? [];
  const meta = data?.meta;
  const totalPages = meta ? Math.ceil(meta.total / meta.pageSize) : 1;

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">
            {t("moderation.filter.status")}
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-1.5 text-sm"
          >
            <option value="all">{t("moderation.filter.all")}</option>
            <option value="pending">{t("moderation.status.pending")}</option>
            <option value="reviewed">{t("moderation.status.reviewed")}</option>
            <option value="dismissed">{t("moderation.status.dismissed")}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">
            {t("moderation.filter.contentType")}
          </label>
          <select
            value={contentType}
            onChange={(e) => {
              setContentType(e.target.value);
              setPage(1);
            }}
            className="bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-1.5 text-sm"
          >
            <option value="all">{t("moderation.filter.all")}</option>
            <option value="post">{t("moderation.contentTypes.post")}</option>
            <option value="article">{t("moderation.contentTypes.article")}</option>
            <option value="message">{t("moderation.contentTypes.message")}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3" aria-label="loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-800 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-zinc-400 py-8 text-center">{t("moderation.emptyQueue")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-left">
                <th className="pb-2 pr-4 font-medium">{t("moderation.table.content")}</th>
                <th className="pb-2 pr-4 font-medium">{t("moderation.table.author")}</th>
                <th className="pb-2 pr-4 font-medium">{t("moderation.table.type")}</th>
                <th className="pb-2 pr-4 font-medium">{t("moderation.table.source")}</th>
                <th className="pb-2 pr-4 font-medium">{t("moderation.table.reason")}</th>
                <th className="pb-2 pr-4 font-medium">{t("moderation.table.flaggedAt")}</th>
                <th className="pb-2 font-medium">{t("moderation.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-800">
                  <td className="py-3 pr-4 max-w-xs">
                    <span className="text-zinc-200 truncate block">
                      {item.contentPreview
                        ? item.keywordMatched
                          ? highlightKeyword(item.contentPreview, item.keywordMatched)
                          : item.contentPreview
                        : "—"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-zinc-300">{item.authorName ?? "Unknown"}</td>
                  <td className="py-3 pr-4">
                    <span className="bg-zinc-700 text-zinc-200 text-xs px-2 py-1 rounded">
                      {item.contentType}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {item.reportCount > 0 ? (
                      <span className="bg-orange-700 text-orange-100 text-xs px-2 py-1 rounded">
                        {t("moderation.source.reported", { count: item.reportCount })}
                      </span>
                    ) : (
                      <span className="bg-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded">
                        {t("moderation.source.autoFlagged")}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-zinc-300">{item.flagReason}</td>
                  <td className="py-3 pr-4 text-zinc-400 text-xs">
                    {new Date(item.flaggedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => handleApprove(item.id)}
                        className="bg-green-700 hover:bg-green-600 text-white text-xs px-2 py-1 rounded min-h-[28px]"
                        aria-label={t("moderation.action.approve")}
                      >
                        {t("moderation.action.approve")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialogItem({ id: item.id, action: "remove" })}
                        className="bg-red-700 hover:bg-red-600 text-white text-xs px-2 py-1 rounded min-h-[28px]"
                        aria-label={t("moderation.action.remove")}
                      >
                        {t("moderation.action.remove")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialogItem({ id: item.id, action: "dismiss" })}
                        className="bg-zinc-600 hover:bg-zinc-500 text-white text-xs px-2 py-1 rounded min-h-[28px]"
                        aria-label={t("moderation.action.dismiss")}
                      >
                        {t("moderation.action.dismiss")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openDisciplineDialog(item.id, "warn")}
                        className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-2 py-1 rounded min-h-[28px]"
                        aria-label={t("moderation.action.warn")}
                      >
                        {t("moderation.action.warn")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openDisciplineDialog(item.id, "suspend")}
                        className="bg-orange-700 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded min-h-[28px]"
                        aria-label={t("moderation.action.suspend")}
                      >
                        {t("moderation.action.suspend")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openDisciplineDialog(item.id, "ban")}
                        className="bg-red-900 hover:bg-red-800 text-white text-xs px-2 py-1 rounded min-h-[28px]"
                        aria-label={t("moderation.action.ban")}
                      >
                        {t("moderation.action.ban")}
                      </button>
                      {item.contentType === "message" && (
                        <a
                          href={`/admin/moderation/${item.id}/conversation`}
                          className="bg-blue-800 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded min-h-[28px] flex items-center"
                          aria-label={t("moderation.action.viewContext")}
                        >
                          {t("moderation.action.viewContext")}
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total > meta.pageSize && (
        <div className="flex gap-2 mt-4 justify-end items-center">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm text-zinc-400 hover:text-white disabled:opacity-50"
          >
            {t("moderation.pagination.previous")}
          </button>
          <span className="text-sm text-zinc-400">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-sm text-zinc-400 hover:text-white disabled:opacity-50"
          >
            {t("moderation.pagination.next")}
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {dialogItem && (
        <ModerationActionDialog
          action={dialogItem.action}
          disciplineHistory={dialogItem.disciplineHistory}
          onConfirm={({ reason, durationHours, confirmed }) =>
            mutation.mutate({
              id: dialogItem.id,
              action: dialogItem.action,
              reason,
              durationHours,
              confirmed,
            })
          }
          onCancel={() => setDialogItem(null)}
          isPending={mutation.isPending}
        />
      )}
    </div>
  );
}
