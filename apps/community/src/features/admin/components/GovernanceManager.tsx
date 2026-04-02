"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface GovernanceDoc {
  id: string;
  title: string;
  slug: string;
  content: string;
  contentIgbo: string | null;
  version: number;
  status: string;
  visibility: string;
  publishedAt: string | null;
  updatedAt: string;
}

interface DocsResponse {
  documents: GovernanceDoc[];
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "published" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

export function GovernanceManager() {
  const t = useTranslations("Admin.governance");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<GovernanceDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    content: "",
    contentIgbo: "",
    visibility: "public" as string,
  });

  const { data, isLoading, isError } = useQuery<DocsResponse>({
    queryKey: ["admin", "governance-documents"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/governance-documents", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      return json.data as DocsResponse;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await fetch("/api/v1/admin/governance-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Create failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "governance-documents"] });
      setCreating(false);
      setForm({ title: "", slug: "", content: "", contentIgbo: "", visibility: "public" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof form> }) => {
      const res = await fetch(`/api/v1/admin/governance-documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "governance-documents"] });
      setEditing(null);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/admin/governance-documents/${id}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Publish failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "governance-documents"] });
    },
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          onClick={() => setCreating(true)}
        >
          {t("createNew")}
        </button>
      </div>

      {isLoading && <p className="text-zinc-400">{t("loading")}</p>}
      {isError && <p className="text-red-400">{t("error")}</p>}

      {/* Create form */}
      {creating && (
        <div className="border border-zinc-700 rounded-xl p-6 mb-6 bg-zinc-900">
          <h3 className="font-semibold mb-4 text-white">{t("createNew")}</h3>
          <div className="space-y-3">
            <input
              className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-white placeholder:text-zinc-500"
              placeholder={t("fieldTitle")}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <input
              className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-white placeholder:text-zinc-500"
              placeholder={t("fieldSlug")}
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <select
              className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-white"
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="public">{t("visibilityPublic")}</option>
              <option value="admin_only">{t("visibilityAdminOnly")}</option>
            </select>
            <textarea
              className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm min-h-[120px] bg-zinc-800 text-white placeholder:text-zinc-500"
              placeholder={t("fieldContentEn")}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <textarea
              className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm min-h-[80px] bg-zinc-800 text-white placeholder:text-zinc-500"
              placeholder={t("fieldContentIg")}
              value={form.contentIgbo}
              onChange={(e) => setForm({ ...form, contentIgbo: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm"
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending}
              >
                {t("save")}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-200 text-sm hover:bg-zinc-800"
                onClick={() => setCreating(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document list */}
      {data && (
        <div className="space-y-4">
          {data.documents.map((doc) => (
            <div key={doc.id} className="border border-zinc-700 rounded-xl p-5 bg-zinc-900">
              {editing?.id === doc.id ? (
                <div className="space-y-3">
                  <input
                    className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-white"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                  <select
                    className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-white"
                    value={form.visibility}
                    onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                  >
                    <option value="public">{t("visibilityPublic")}</option>
                    <option value="admin_only">{t("visibilityAdminOnly")}</option>
                  </select>
                  <textarea
                    className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm min-h-[120px] bg-zinc-800 text-white"
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                  />
                  <textarea
                    className="w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm min-h-[80px] bg-zinc-800 text-white"
                    value={form.contentIgbo}
                    onChange={(e) => setForm({ ...form, contentIgbo: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button
                      className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm"
                      onClick={() =>
                        updateMutation.mutate({
                          id: doc.id,
                          data: {
                            title: form.title,
                            content: form.content,
                            contentIgbo: form.contentIgbo,
                            visibility: form.visibility as "public" | "admin_only",
                          },
                        })
                      }
                      disabled={updateMutation.isPending}
                    >
                      {t("save")}
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-200 text-sm hover:bg-zinc-800"
                      onClick={() => setEditing(null)}
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">{doc.title}</h3>
                      <StatusBadge status={doc.status} />
                      <span className="text-xs text-zinc-400">v{doc.version}</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      {doc.slug} &bull; {doc.visibility}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className="px-3 py-1.5 rounded-lg border border-zinc-600 text-zinc-200 text-sm hover:bg-zinc-800"
                      onClick={() => {
                        setEditing(doc);
                        setForm({
                          title: doc.title,
                          slug: doc.slug,
                          content: doc.content,
                          contentIgbo: doc.contentIgbo ?? "",
                          visibility: doc.visibility,
                        });
                      }}
                    >
                      {t("edit")}
                    </button>
                    {doc.status === "draft" && (
                      <button
                        className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm"
                        onClick={() => publishMutation.mutate(doc.id)}
                        disabled={publishMutation.isPending}
                      >
                        {t("publish")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {data.documents.length === 0 && (
            <p className="text-zinc-400 text-center py-8">{t("empty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
