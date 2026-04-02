"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import type { BadgeType } from "@igbo/db/schema/community-badges";

interface MemberSearchResult {
  userId: string;
  displayName: string | null;
  email: string;
}

interface AdminUserPointsProfile {
  userId: string;
  displayName: string | null;
  email: string;
  memberSince: string;
  badgeType: BadgeType | null;
  badgeAssignedAt: string | null;
}

interface PointsSummary {
  total: number;
  thisWeek: number;
  thisMonth: number;
}

interface LedgerEntry {
  id: string;
  points: number;
  reason: string;
  sourceType: "like_received" | "event_attended" | "article_published";
  sourceId: string;
  multiplierApplied: string;
  createdAt: string;
}

interface ThrottleEntry {
  date: string;
  reason: string | null;
  eventType: string | null;
  eventId: string | null;
  triggeredBy: string | null;
}

interface ProfileResponse {
  profile: AdminUserPointsProfile;
  summary: PointsSummary;
  ledger: { entries: LedgerEntry[]; total: number };
  throttleHistory: { entries: ThrottleEntry[]; total: number };
}

const VALID_ACTIVITY_TYPES = ["", "like_received", "event_attended", "article_published"] as const;

type ActivityTypeFilter = (typeof VALID_ACTIVITY_TYPES)[number];

const SOURCE_TYPE_I18N: Record<string, string> = {
  like_received: "likeReceived",
  event_attended: "eventAttended",
  article_published: "articlePublished",
};

export function MemberPointsInvestigator() {
  const t = useTranslations("Admin.memberPoints");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>(searchParams.get("userId") ?? "");
  const [showDropdown, setShowDropdown] = useState(false);

  // Ledger pagination + filter
  const [ledgerPage, setLedgerPage] = useState(1);
  const [activityType, setActivityType] = useState<ActivityTypeFilter>("");

  // Throttle pagination (independent from ledger)
  const [throttlePage, setThrottlePage] = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const limit = 20;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Member search query
  const searchQuery = useQuery<{ results: MemberSearchResult[] }>({
    queryKey: ["admin", "members-search", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/admin/members/search?q=${encodeURIComponent(debouncedQuery)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json();
      return json.data as { results: MemberSearchResult[] };
    },
  });

  // Profile + history query
  const profileQuery = useQuery<ProfileResponse>({
    queryKey: ["admin", "member-points", selectedUserId, ledgerPage, activityType, throttlePage],
    enabled: !!selectedUserId,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(ledgerPage),
        limit: String(limit),
        throttlePage: String(throttlePage),
        throttleLimit: String(limit),
      });
      if (activityType) params.set("activityType", activityType);
      const res = await fetch(
        `/api/v1/admin/members/${selectedUserId}/points?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load member profile");
      const json = await res.json();
      return json.data as ProfileResponse;
    },
  });

  function handleMemberSelect(member: MemberSearchResult) {
    setSelectedUserId(member.userId);
    setQuery(member.displayName ?? member.email);
    setShowDropdown(false);
    setLedgerPage(1);
    setThrottlePage(1);
    setActivityType("");
    router.push(`/admin/members/points?userId=${member.userId}`);
  }

  const ledgerTotal = profileQuery.data?.ledger.total ?? 0;
  const throttleTotal = profileQuery.data?.throttleHistory.total ?? 0;
  const ledgerTotalPages = Math.ceil(ledgerTotal / limit);
  const throttleTotalPages = Math.ceil(throttleTotal / limit);

  return (
    <div className="space-y-8">
      {/* ─── Search Bar ─────────────────────────────────────────────────────── */}
      <div className="relative" ref={searchContainerRef}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder={t("searchPlaceholder")}
          className="w-full border border-zinc-700 rounded-lg px-4 py-2 text-sm bg-zinc-900 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          aria-label={t("searchPlaceholder")}
        />
        {showDropdown && debouncedQuery.length >= 2 && (
          <div className="absolute z-10 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {searchQuery.isLoading && (
              <p className="px-4 py-2 text-sm text-zinc-400">{t("loading")}</p>
            )}
            {searchQuery.data?.results.length === 0 && (
              <p className="px-4 py-2 text-sm text-zinc-400">{t("noResults")}</p>
            )}
            {searchQuery.data?.results.map((member) => (
              <button
                key={member.userId}
                className="w-full text-left px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
                onClick={() => handleMemberSelect(member)}
              >
                <span className="font-medium">{member.displayName ?? "—"}</span>{" "}
                <span className="text-zinc-400">{member.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Loading / Error ────────────────────────────────────────────────── */}
      {profileQuery.isLoading && selectedUserId && (
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800 rounded" />
          ))}
          <p className="text-sm text-zinc-400">{t("loading")}</p>
        </div>
      )}
      {profileQuery.isError && (
        <p className="text-destructive text-sm" role="alert">
          {t("error")}
        </p>
      )}

      {/* ─── Profile Card ───────────────────────────────────────────────────── */}
      {profileQuery.data && (
        <div className="space-y-8">
          <section className="border border-zinc-700 rounded-xl p-6 space-y-4 bg-zinc-900">
            <h2 className="text-base font-semibold">{t("profileCard")}</h2>
            <div className="flex flex-wrap gap-6 items-start">
              <div>
                <p className="text-xs text-zinc-400">{t("name")}</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  {profileQuery.data.profile.displayName ?? "—"}
                  <VerificationBadge badgeType={profileQuery.data.profile.badgeType} size="sm" />
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">{profileQuery.data.profile.email}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{t("badge")}</p>
                <p className="text-sm font-medium">
                  {profileQuery.data.profile.badgeType ? (
                    <span className="capitalize">{profileQuery.data.profile.badgeType}</span>
                  ) : (
                    t("noBadge")
                  )}
                  {profileQuery.data.profile.badgeAssignedAt && (
                    <span className="text-xs text-zinc-400 ml-1">
                      ({new Date(profileQuery.data.profile.badgeAssignedAt).toLocaleDateString()})
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{t("memberSince")}</p>
                <p className="text-sm font-medium">
                  {new Date(profileQuery.data.profile.memberSince).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{t("totalPoints")}</p>
                <p className="text-sm font-mono font-semibold">
                  {profileQuery.data.summary.total.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{t("thisWeek")}</p>
                <p className="text-sm font-mono">
                  {profileQuery.data.summary.thisWeek.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{t("thisMonth")}</p>
                <p className="text-sm font-mono">
                  {profileQuery.data.summary.thisMonth.toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          {/* ─── Ledger History ─────────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("ledgerHistory")}</h2>
              <select
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value as ActivityTypeFilter);
                  setLedgerPage(1);
                }}
                className="border border-zinc-700 rounded px-2 py-1 text-sm bg-zinc-800 text-white"
                aria-label={t("sourceType")}
              >
                <option value="">{t("sourceType")}</option>
                <option value="like_received">{t("likeReceived")}</option>
                <option value="event_attended">{t("eventAttended")}</option>
                <option value="article_published">{t("articlePublished")}</option>
              </select>
            </div>
            {profileQuery.data.ledger.entries.length === 0 ? (
              <p className="text-zinc-400 text-sm py-8 text-center">{t("noPointsYet")}</p>
            ) : (
              <div className="border border-zinc-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-800 text-zinc-200">
                    <tr>
                      <th className="text-left px-4 py-2">{t("date")}</th>
                      <th className="text-right px-4 py-2">{t("points")}</th>
                      <th className="text-left px-4 py-2">{t("reason")}</th>
                      <th className="text-left px-4 py-2">{t("sourceType")}</th>
                      <th className="text-left px-4 py-2">{t("sourceId")}</th>
                      <th className="text-right px-4 py-2">{t("multiplier")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profileQuery.data.ledger.entries.map((entry) => (
                      <tr key={entry.id} className="border-t">
                        <td className="px-4 py-2 text-xs text-zinc-400">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{entry.points}</td>
                        <td className="px-4 py-2">{entry.reason}</td>
                        <td className="px-4 py-2 text-zinc-400 text-xs">
                          {t(SOURCE_TYPE_I18N[entry.sourceType] ?? entry.sourceType)}
                        </td>
                        <td className="px-4 py-2 text-zinc-400 text-xs font-mono">
                          {entry.sourceId}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {entry.multiplierApplied}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ledgerTotalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  {ledgerPage} / {ledgerTotalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={ledgerPage <= 1}
                    onClick={() => setLedgerPage((p) => p - 1)}
                    className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                  >
                    &larr;
                  </button>
                  <button
                    disabled={ledgerPage >= ledgerTotalPages}
                    onClick={() => setLedgerPage((p) => p + 1)}
                    className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ─── Throttle History ───────────────────────────────────────────── */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold">{t("throttleHistory")}</h2>
            {profileQuery.data.throttleHistory.entries.length === 0 ? (
              <p className="text-zinc-400 text-sm py-8 text-center">{t("noThrottleEvents")}</p>
            ) : (
              <div className="border border-zinc-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-800 text-zinc-200">
                    <tr>
                      <th className="text-left px-4 py-2">{t("date")}</th>
                      <th className="text-left px-4 py-2">{t("throttleReason")}</th>
                      <th className="text-left px-4 py-2">{t("eventType")}</th>
                      <th className="text-left px-4 py-2">{t("triggeredBy")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profileQuery.data.throttleHistory.entries.map((entry, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-2 text-xs text-zinc-400">
                          {new Date(entry.date).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-xs">{entry.reason ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-zinc-400">
                          {entry.eventType ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{entry.triggeredBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {throttleTotalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  {throttlePage} / {throttleTotalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={throttlePage <= 1}
                    onClick={() => setThrottlePage((p) => p - 1)}
                    className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                  >
                    &larr;
                  </button>
                  <button
                    disabled={throttlePage >= throttleTotalPages}
                    onClick={() => setThrottlePage((p) => p + 1)}
                    className="px-3 py-1 border border-zinc-700 rounded text-sm text-zinc-200 bg-zinc-900 disabled:opacity-50"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
