"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Keyword {
  id: string;
  keyword: string;
  category: string;
  severity: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

interface KeywordsResponse {
  data: { keywords: Keyword[] };
}

const CATEGORIES = ["hate_speech", "explicit", "spam", "harassment", "other"] as const;
const SEVERITIES = ["low", "medium", "high"] as const;

export function KeywordManager() {
  const t = useTranslations("Admin");
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editKeyword, setEditKeyword] = useState<Keyword | null>(null);
  const [newKw, setNewKw] = useState({
    keyword: "",
    category: "other",
    severity: "low",
    notes: "",
  });

  const { data } = useQuery<KeywordsResponse>({
    queryKey: ["admin", "moderation", "keywords"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/moderation/keywords", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch keywords");
      return res.json() as Promise<KeywordsResponse>;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: typeof newKw) => {
      const res = await fetch("/api/v1/admin/moderation/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Add failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "moderation", "keywords"] });
      setShowAddDialog(false);
      setNewKw({ keyword: "", category: "other", severity: "low", notes: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Keyword> }) => {
      const res = await fetch(`/api/v1/admin/moderation/keywords/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "moderation", "keywords"] });
      setEditKeyword(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/admin/moderation/keywords/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "moderation", "keywords"] });
    },
  });

  const keywords = data?.data?.keywords ?? [];
  const activeCount = keywords.filter((k) => k.isActive).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-zinc-400 text-sm">
          {t("moderation.keywords.activeCount", { count: activeCount })}
        </p>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="bg-blue-700 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded"
        >
          {t("moderation.keywords.addKeyword")}
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400 text-left">
            <th className="pb-2 pr-4 font-medium">{t("moderation.keywords.keyword")}</th>
            <th className="pb-2 pr-4 font-medium">{t("moderation.keywords.category")}</th>
            <th className="pb-2 pr-4 font-medium">{t("moderation.keywords.severity")}</th>
            <th className="pb-2 pr-4 font-medium">{t("moderation.keywords.active")}</th>
            <th className="pb-2 font-medium">{t("moderation.table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => (
            <tr key={kw.id} className="border-b border-zinc-800">
              <td className="py-3 pr-4 text-zinc-200">{kw.keyword}</td>
              <td className="py-3 pr-4 text-zinc-300">{kw.category}</td>
              <td className="py-3 pr-4 text-zinc-300">{kw.severity}</td>
              <td className="py-3 pr-4">
                <button
                  type="button"
                  onClick={() =>
                    updateMutation.mutate({ id: kw.id, updates: { isActive: !kw.isActive } })
                  }
                  className={`text-xs px-2 py-1 rounded ${kw.isActive ? "bg-green-700 text-white" : "bg-zinc-700 text-zinc-400"}`}
                  aria-label={
                    kw.isActive
                      ? t("moderation.keywords.active")
                      : t("moderation.keywords.inactive")
                  }
                >
                  {kw.isActive
                    ? t("moderation.keywords.active")
                    : t("moderation.keywords.inactive")}
                </button>
              </td>
              <td className="py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditKeyword(kw)}
                    className="text-zinc-400 hover:text-white text-xs"
                  >
                    {t("moderation.keywords.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t("moderation.keywords.confirmDelete"))) {
                        deleteMutation.mutate(kw.id);
                      }
                    }}
                    className="text-red-400 hover:text-red-300 text-xs"
                    aria-label="delete"
                  >
                    {t("moderation.keywords.delete")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add dialog */}
      {showAddDialog && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">
              {t("moderation.keywords.addKeyword")}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.keyword")}
                </label>
                <input
                  value={newKw.keyword}
                  onChange={(e) => setNewKw({ ...newKw, keyword: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.category")}
                </label>
                <select
                  value={newKw.category}
                  onChange={(e) => setNewKw({ ...newKw, category: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.severity")}
                </label>
                <select
                  value={newKw.severity}
                  onChange={(e) => setNewKw({ ...newKw, severity: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.notes")}
                </label>
                <textarea
                  value={newKw.notes}
                  onChange={(e) => setNewKw({ ...newKw, notes: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowAddDialog(false)}
                className="text-zinc-400 hover:text-white text-sm px-4 py-2"
              >
                {t("moderation.action.cancel")}
              </button>
              <button
                type="button"
                onClick={() => addMutation.mutate(newKw)}
                disabled={!newKw.keyword || addMutation.isPending}
                className="bg-blue-700 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
              >
                {addMutation.isPending ? "..." : t("moderation.keywords.add")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editKeyword && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">
              {t("moderation.keywords.editTitle")}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.keyword")}
                </label>
                <input
                  value={editKeyword.keyword}
                  onChange={(e) => setEditKeyword({ ...editKeyword, keyword: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.category")}
                </label>
                <select
                  value={editKeyword.category}
                  onChange={(e) => setEditKeyword({ ...editKeyword, category: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.severity")}
                </label>
                <select
                  value={editKeyword.severity}
                  onChange={(e) => setEditKeyword({ ...editKeyword, severity: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  {t("moderation.keywords.notes")}
                </label>
                <textarea
                  value={editKeyword.notes ?? ""}
                  onChange={(e) =>
                    setEditKeyword({ ...editKeyword, notes: e.target.value || null })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => setEditKeyword(null)}
                className="text-zinc-400 hover:text-white text-sm px-4 py-2"
              >
                {t("moderation.action.cancel")}
              </button>
              <button
                type="button"
                onClick={() =>
                  updateMutation.mutate({
                    id: editKeyword.id,
                    updates: {
                      keyword: editKeyword.keyword,
                      category: editKeyword.category,
                      severity: editKeyword.severity,
                      notes: editKeyword.notes ?? undefined,
                    },
                  })
                }
                disabled={updateMutation.isPending}
                className="bg-blue-700 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
              >
                {t("moderation.keywords.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
