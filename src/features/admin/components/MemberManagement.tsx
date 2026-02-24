"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  useMembers,
  type AdminMember,
  type MembershipTier,
} from "@/features/admin/hooks/use-members";
import { TierChangeDialog } from "./TierChangeDialog";

const TIER_OPTIONS = [
  { value: "", labelKey: "tierFilter.all" },
  { value: "BASIC", labelKey: "tierFilter.basic" },
  { value: "PROFESSIONAL", labelKey: "tierFilter.professional" },
  { value: "TOP_TIER", labelKey: "tierFilter.topTier" },
] as const;

export function MemberManagement() {
  const t = useTranslations("Admin.members");
  const [tierFilter, setTierFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selectedMember, setSelectedMember] = useState<AdminMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const format = useFormatter();
  const { data, isLoading, isError } = useMembers(
    tierFilter || undefined,
    search || undefined,
    page,
  );

  const members = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta ? Math.ceil(meta.total / meta.pageSize) : 1;

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleTierFilter(tier: string) {
    setTierFilter(tier);
    setPage(1);
  }

  function handleChangeTier(member: AdminMember) {
    setSelectedMember(member);
    setDialogOpen(true);
  }

  function formatDate(dateStr: string) {
    return format.dateTime(new Date(dateStr), { dateStyle: "medium" });
  }

  function getTierLabel(tier: MembershipTier) {
    const map: Record<MembershipTier, string> = {
      BASIC: t("tierFilter.basic"),
      PROFESSIONAL: t("tierFilter.professional"),
      TOP_TIER: t("tierFilter.topTier"),
    };
    return map[tier];
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">{t("title")}</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="rounded-md bg-zinc-800 border border-zinc-700 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
          >
            {t("search")}
          </button>
        </form>

        <select
          value={tierFilter}
          onChange={(e) => handleTierFilter(e.target.value)}
          className="rounded-md bg-zinc-800 border border-zinc-700 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={t("tierFilter.all")}
        >
          {TIER_OPTIONS.map(({ value, labelKey }) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading && <p className="text-zinc-400 py-8 text-center">{t("loading")}</p>}
      {isError && <p className="text-red-400 py-8 text-center">{t("error")}</p>}
      {!isLoading && !isError && members.length === 0 && (
        <p className="text-zinc-400 py-8 text-center">{t("noMembers")}</p>
      )}
      {!isLoading && !isError && members.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">{t("columns.name")}</th>
                <th className="px-4 py-3">{t("columns.email")}</th>
                <th className="px-4 py-3">{t("columns.tier")}</th>
                <th className="px-4 py-3">{t("columns.joinedDate")}</th>
                <th className="px-4 py-3">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {members.map((member) => (
                <tr key={member.id} className="bg-zinc-900 hover:bg-zinc-800 transition-colors">
                  <td className="px-4 py-3 text-white">
                    {member.displayName ?? member.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{member.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200">
                      {getTierLabel(member.membershipTier)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{formatDate(member.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleChangeTier(member)}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                    >
                      {t("changeTier.title")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-zinc-400">
          <span>
            {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)}{" "}
            / {meta.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Tier Change Dialog */}
      {selectedMember && (
        <TierChangeDialog open={dialogOpen} onOpenChange={setDialogOpen} member={selectedMember} />
      )}
    </div>
  );
}
