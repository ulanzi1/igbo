"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
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

  const activeQuery = view === "leaderboard" ? leaderboardQuery : flaggedQuery;
  const totalPages = activeQuery.data ? Math.ceil(activeQuery.data.pagination.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* ─── Tab Toggle ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => handleViewChange("leaderboard")}
          className={`px-4 py-2 text-sm font-medium rounded-t ${
            view === "leaderboard"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("leaderboardTab")}
        </button>
        <button
          onClick={() => handleViewChange("flagged")}
          className={`px-4 py-2 text-sm font-medium rounded-t ${
            view === "flagged"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
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
              <label className="text-xs text-muted-foreground">{t("dateFrom")}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t("dateTo")}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t("activityType")}</label>
              <select
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value);
                  setPage(1);
                }}
                className="border rounded px-2 py-1 text-sm"
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
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          )}
          {leaderboardQuery.isError && <p className="text-destructive text-sm">{t("error")}</p>}
          {leaderboardQuery.data && (
            <>
              {leaderboardQuery.data.data.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("noResults")}</p>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-4 py-2">{t("rank")}</th>
                        <th className="text-left px-4 py-2">{t("displayName")}</th>
                        <th className="text-left px-4 py-2">{t("email")}</th>
                        <th className="text-right px-4 py-2">{t("totalPoints")}</th>
                        <th className="text-center px-4 py-2">{t("badge")}</th>
                        <th className="text-left px-4 py-2">{t("memberSince")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardQuery.data.data.map((user, index) => (
                        <tr
                          key={user.userId}
                          className="border-t cursor-pointer hover:bg-muted"
                          role="link"
                          onClick={() => handleRowClick(user.userId)}
                        >
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {(page - 1) * limit + index + 1}
                          </td>
                          <td className="px-4 py-2 font-medium">{user.displayName ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
                          <td className="px-4 py-2 text-right font-mono">
                            {user.totalPoints.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <VerificationBadge badgeType={user.badgeType} size="sm" />
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">
                            {new Date(user.memberSince).toLocaleDateString()}
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
                  <span className="text-muted-foreground">
                    {t("page")} {page} {t("of")} {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                    >
                      &larr;
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1 border rounded text-sm disabled:opacity-50"
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
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          )}
          {flaggedQuery.isError && <p className="text-destructive text-sm">{t("error")}</p>}
          {flaggedQuery.data && (
            <>
              {flaggedQuery.data.data.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  {t("noFlaggedUsers")}
                </p>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-4 py-2">{t("displayName")}</th>
                        <th className="text-right px-4 py-2">{t("throttleCount")}</th>
                        <th className="text-left px-4 py-2">{t("lastThrottled")}</th>
                        <th className="text-left px-4 py-2">{t("reasons")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flaggedQuery.data.data.map((user) => (
                        <tr
                          key={user.userId}
                          className="border-t cursor-pointer hover:bg-muted"
                          role="link"
                          onClick={() => handleRowClick(user.userId)}
                        >
                          <td className="px-4 py-2 font-medium">{user.displayName ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-mono">{user.throttleCount}</td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">
                            {new Date(user.lastThrottledAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">
                            {user.reasons.join(", ") || "—"}
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
                  <span className="text-muted-foreground">
                    {t("page")} {page} {t("of")} {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                    >
                      &larr;
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1 border rounded text-sm disabled:opacity-50"
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
