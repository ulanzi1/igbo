"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Link } from "@/i18n/navigation";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import type { BadgeType } from "@/db/schema/community-badges";

interface LeaderboardUser {
  userId: string;
  displayName: string | null;
  email: string;
  totalPoints: number;
  badgeType: BadgeType | null;
  memberSince: string;
}

interface FlaggedUser {
  userId: string;
  displayName: string | null;
  throttleCount: number;
  lastThrottledAt: string;
  reasons: string[];
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number };
}

type View = "leaderboard" | "flagged";

export function LeaderboardTable() {
  const t = useTranslations("Admin.leaderboard");
  const router = useRouter();

  const [view, setView] = useState<View>("leaderboard");
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activityType, setActivityType] = useState("");
  const [sortCol, setSortCol] = useState<"rank" | "displayName" | "totalPoints" | "badgeType">(
    "rank",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const limit = 25;

  const leaderboardQuery = useQuery<PaginatedResponse<LeaderboardUser>>({
    queryKey: ["admin", "leaderboard", page, dateFrom, dateTo, activityType],
    enabled: view === "leaderboard",
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        view: "leaderboard",
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (activityType) params.set("activityType", activityType);
      const res = await fetch(`/api/v1/admin/leaderboard?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load leaderboard");
      const json = await res.json();
      return json.data as PaginatedResponse<LeaderboardUser>;
    },
  });

  const flaggedQuery = useQuery<PaginatedResponse<FlaggedUser>>({
    queryKey: ["admin", "leaderboard-flagged", page],
    enabled: view === "flagged",
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        view: "flagged",
      });
      const res = await fetch(`/api/v1/admin/leaderboard?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load flagged users");
      const json = await res.json();
      return json.data as PaginatedResponse<FlaggedUser>;
    },
  });

  function handleRowClick(userId: string) {
    router.push(`/admin/members/points?userId=${userId}`);
  }

  function handleViewChange(newView: View) {
    setView(newView);
    setPage(1);
  }

  function handleSort(col: "rank" | "displayName" | "totalPoints" | "badgeType") {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sortedLeaderboard = (() => {
    const items = [...(leaderboardQuery.data?.data ?? [])];
    return items.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "displayName") {
        cmp = (a.displayName ?? "").localeCompare(b.displayName ?? "");
      } else if (sortCol === "totalPoints") {
        cmp = a.totalPoints - b.totalPoints;
      } else if (sortCol === "badgeType") {
        cmp = (a.badgeType ?? "").localeCompare(b.badgeType ?? "");
      }
      // sortCol === "rank": cmp remains 0, preserving server order
      return sortDir === "asc" ? cmp : -cmp;
    });
  })();

  const sortIndicator = (col: "rank" | "displayName" | "totalPoints" | "badgeType") =>
    sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const activeQuery = view === "leaderboard" ? leaderboardQuery : flaggedQuery;
  const totalPages = activeQuery.data ? Math.ceil(activeQuery.data.pagination.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* ─── Tab Toggle ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-zinc-700 pb-2">
        <button
          onClick={() => handleViewChange("leaderboard")}
          className={`px-4 py-2 text-sm font-medium rounded-t ${
            view === "leaderboard"
              ? "border-b-2 border-white text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {t("leaderboardTab")}
        </button>
        <button
          onClick={() => handleViewChange("flagged")}
          className={`px-4 py-2 text-sm font-medium rounded-t ${
            view === "flagged"
              ? "border-b-2 border-white text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {t("flaggedUsersTab")}
        </button>
      </div>

      {/* ─── Leaderboard Tab ────────────────────────────────────────────────── */}
      {view === "leaderboard" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">{t("dateFrom")}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="border border-zinc-700 rounded px-2 py-1 text-sm bg-zinc-800 text-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">{t("dateTo")}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="border border-zinc-700 rounded px-2 py-1 text-sm bg-zinc-800 text-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">{t("activityType")}</label>
              <select
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value);
                  setPage(1);
                }}
                className="border border-zinc-700 rounded px-2 py-1 text-sm bg-zinc-800 text-white"
              >
                <option value="">{t("allTypes")}</option>
                <option value="like_received">{t("likeReceived")}</option>
                <option value="event_attended">{t("eventAttended")}</option>
                <option value="article_published">{t("articlePublished")}</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {leaderboardQuery.isLoading && (
            <div className="animate-pulse space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-zinc-800 rounded" />
              ))}
            </div>
          )}
          {leaderboardQuery.isError && <p className="text-destructive text-sm">{t("error")}</p>}
          {leaderboardQuery.data && (
            <>
              {leaderboardQuery.data.data.length === 0 ? (
                <p className="text-zinc-400 text-sm py-8 text-center">{t("noResults")}</p>
              ) : (
                <div className="border border-zinc-700 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-800 text-zinc-200">
                      <tr>
                        <th className="text-left px-4 py-2">
                          <button
                            className="hover:text-white"
                            onClick={() => handleSort("rank")}
                            aria-label={`${t("rank")} sort`}
                          >
                            {t("rank")}
                            {sortIndicator("rank")}
                          </button>
                        </th>
                        <th className="text-left px-4 py-2">
                          <button
                            className="hover:text-white"
                            onClick={() => handleSort("displayName")}
                            aria-label={`${t("displayName")} sort`}
                          >
                            {t("displayName")}
                            {sortIndicator("displayName")}
                          </button>
                        </th>
                        <th className="text-left px-4 py-2">{t("email")}</th>
                        <th className="text-right px-4 py-2">
                          <button
                            className="hover:text-white"
                            onClick={() => handleSort("totalPoints")}
                            aria-label={`${t("totalPoints")} sort`}
                          >
                            {t("totalPoints")}
                            {sortIndicator("totalPoints")}
                          </button>
                        </th>
                        <th className="text-center px-4 py-2">
                          <button
                            className="hover:text-white"
                            onClick={() => handleSort("badgeType")}
                            aria-label={`${t("badge")} sort`}
                          >
                            {t("badge")}
                            {sortIndicator("badgeType")}
                          </button>
                        </th>
                        <th className="text-left px-4 py-2">{t("memberSince")}</th>
                        <th className="text-left px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeaderboard.map((user, index) => (
                        <tr
                          key={user.userId}
                          className="border-t border-zinc-700 cursor-pointer hover:bg-zinc-800"
                          role="link"
                          onClick={() => handleRowClick(user.userId)}
                        >
                          <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                            {(page - 1) * limit + index + 1}
                          </td>
                          <td className="px-4 py-2 font-medium">{user.displayName ?? "—"}</td>
                          <td className="px-4 py-2 text-zinc-400">{user.email}</td>
                          <td className="px-4 py-2 text-right font-mono">
                            {user.totalPoints.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <VerificationBadge badgeType={user.badgeType} size="sm" />
                          </td>
                          <td className="px-4 py-2 text-zinc-400 text-xs">
                            {new Date(user.memberSince).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2">
                            <Link
                              href={`/admin/members/points?userId=${user.userId}`}
                              className="text-blue-400 hover:text-blue-300 text-xs underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("investigate")}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">
                    {t("page")} {page} {t("of")} {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                    >
                      &larr;
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                    >
                      &rarr;
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Flagged Users Tab ──────────────────────────────────────────────── */}
      {view === "flagged" && (
        <div className="space-y-4">
          {flaggedQuery.isLoading && (
            <div className="animate-pulse space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-zinc-800 rounded" />
              ))}
            </div>
          )}
          {flaggedQuery.isError && <p className="text-destructive text-sm">{t("error")}</p>}
          {flaggedQuery.data && (
            <>
              {flaggedQuery.data.data.length === 0 ? (
                <p className="text-zinc-400 text-sm py-8 text-center">{t("noFlaggedUsers")}</p>
              ) : (
                <div className="border border-zinc-700 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-800 text-zinc-200">
                      <tr>
                        <th className="text-left px-4 py-2">{t("displayName")}</th>
                        <th className="text-right px-4 py-2">{t("throttleCount")}</th>
                        <th className="text-left px-4 py-2">{t("lastThrottled")}</th>
                        <th className="text-left px-4 py-2">{t("reasons")}</th>
                        <th className="text-left px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {flaggedQuery.data.data.map((user) => (
                        <tr
                          key={user.userId}
                          className="border-t border-zinc-700 cursor-pointer hover:bg-zinc-800"
                          role="link"
                          onClick={() => handleRowClick(user.userId)}
                        >
                          <td className="px-4 py-2 font-medium">{user.displayName ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-mono">{user.throttleCount}</td>
                          <td className="px-4 py-2 text-zinc-400 text-xs">
                            {new Date(user.lastThrottledAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-zinc-400 text-xs">
                            {user.reasons.join(", ") || "—"}
                          </td>
                          <td className="px-4 py-2">
                            <Link
                              href={`/admin/members/points?userId=${user.userId}`}
                              className="text-blue-400 hover:text-blue-300 text-xs underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("investigate")}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">
                    {t("page")} {page} {t("of")} {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                    >
                      &larr;
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                    >
                      &rarr;
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
