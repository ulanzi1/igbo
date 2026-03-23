"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { LiftSuspensionDialog } from "./LiftSuspensionDialog";
import { Link } from "@/i18n/navigation";

interface DisciplineAction {
  id: string;
  userId: string;
  actionType: "warning" | "suspension" | "ban";
  reason: string;
  notes: string | null;
  status: "active" | "expired" | "lifted";
  suspensionEndsAt: string | null;
  issuedBy: string;
  issuedByName: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftedByName: string | null;
  createdAt: string;
}

interface DisciplineResponse {
  data: {
    user: {
      id: string;
      name: string | null;
      displayName: string | null;
      email: string;
      accountStatus: string;
    };
    disciplineHistory: DisciplineAction[];
    activeSuspension: DisciplineAction | null;
  };
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-green-800 text-green-100",
  SUSPENDED: "bg-orange-800 text-orange-100",
  BANNED: "bg-red-800 text-red-100",
  PENDING_DELETION: "bg-zinc-700 text-zinc-300",
  ANONYMIZED: "bg-zinc-700 text-zinc-300",
};

const ACTION_BORDER_COLORS: Record<string, string> = {
  warning: "border-l-yellow-500",
  suspension: "border-l-orange-500",
  ban: "border-l-red-500",
};

const ACTION_BADGE_CLASSES: Record<string, string> = {
  warning: "bg-yellow-900 text-yellow-200",
  suspension: "bg-orange-900 text-orange-200",
  ban: "bg-red-900 text-red-200",
};

const DISCIPLINE_STATUS_CLASSES: Record<string, string> = {
  active: "bg-green-800 text-green-100",
  expired: "bg-zinc-700 text-zinc-300",
  lifted: "bg-blue-800 text-blue-100",
};

export function MemberDisciplineHistory({ userId }: { userId: string }) {
  const t = useTranslations("Admin");
  const [showLiftDialog, setShowLiftDialog] = useState(false);
  const [now] = useState(() => Date.now());

  const queryKey = ["admin", "discipline", userId];

  const { data, isLoading, error } = useQuery<DisciplineResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/discipline/${userId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch discipline history");
      return res.json() as Promise<DisciplineResponse>;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-zinc-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-red-400">{t("Common.loading")}</p>;
  }

  const { user, disciplineHistory, activeSuspension } = data.data;

  const daysRemaining = activeSuspension?.suspensionEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeSuspension.suspensionEndsAt).getTime() - now) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/admin/moderation"
        className="text-sm text-zinc-400 hover:text-white underline mb-4 inline-block"
      >
        &larr; {t("discipline.backToQueue")}
      </Link>

      {/* Member Info Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold text-white">
          {user.displayName ?? user.name ?? user.email}
        </h2>
        <span
          className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[user.accountStatus] ?? "bg-zinc-700 text-zinc-300"}`}
          data-testid="account-status-badge"
        >
          {t("discipline.memberStatus", { status: user.accountStatus })}
        </span>
      </div>

      {/* Active Suspension Banner */}
      {activeSuspension && (
        <div
          className="bg-orange-900/30 border border-orange-700 rounded-lg p-4 mb-6"
          data-testid="active-suspension-banner"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-orange-200">
                {t("discipline.activeSuspension")}
              </h3>
              {activeSuspension.suspensionEndsAt && (
                <p className="text-sm text-orange-300 mt-1">
                  {t("discipline.endsAt", {
                    date: new Date(activeSuspension.suspensionEndsAt).toLocaleDateString(),
                  })}{" "}
                  {t("discipline.remaining", { days: daysRemaining })}
                </p>
              )}
              <p className="text-sm text-zinc-300 mt-1">{activeSuspension.reason}</p>
              {activeSuspension.issuedByName && (
                <p className="text-xs text-zinc-400 mt-1">
                  {t("discipline.issuedBy", { name: activeSuspension.issuedByName })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowLiftDialog(true)}
              className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded min-h-[44px]"
              data-testid="lift-suspension-btn"
            >
              {t("discipline.liftEarly")}
            </button>
          </div>
        </div>
      )}

      {/* Discipline Timeline */}
      <h3 className="text-lg font-semibold text-white mb-4">
        {disciplineHistory.length > 0
          ? t("discipline.historyCount", { count: disciplineHistory.length })
          : t("discipline.noHistory")}
      </h3>

      {disciplineHistory.length > 0 && (
        <div className="space-y-3">
          {disciplineHistory.map((action) => (
            <div
              key={action.id}
              className={`bg-zinc-800 border-l-4 ${ACTION_BORDER_COLORS[action.actionType] ?? "border-l-zinc-600"} rounded-r-lg p-4`}
              data-testid={`discipline-action-${action.id}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${ACTION_BADGE_CLASSES[action.actionType] ?? "bg-zinc-700 text-zinc-300"}`}
                >
                  {action.actionType}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${DISCIPLINE_STATUS_CLASSES[action.status] ?? "bg-zinc-700 text-zinc-300"}`}
                >
                  {t(`discipline.status.${action.status}`)}
                </span>
                <span className="text-xs text-zinc-400">
                  {new Date(action.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-zinc-200">{action.reason}</p>
              {action.actionType === "suspension" && action.suspensionEndsAt && (
                <p className="text-xs text-zinc-400 mt-1">
                  {t("discipline.endsAt", {
                    date: new Date(action.suspensionEndsAt).toLocaleDateString(),
                  })}
                </p>
              )}
              {action.issuedByName && (
                <p className="text-xs text-zinc-400 mt-1">
                  {t("discipline.issuedBy", { name: action.issuedByName })}
                </p>
              )}
              {action.status === "lifted" && action.liftedByName && (
                <p className="text-xs text-zinc-400 mt-1">
                  {t("discipline.liftedBy", { name: action.liftedByName })}
                  {action.liftedAt && (
                    <>
                      {" — "}
                      {t("discipline.liftedAt", {
                        date: new Date(action.liftedAt).toLocaleDateString(),
                      })}
                    </>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lift Suspension Dialog */}
      {showLiftDialog && activeSuspension && (
        <LiftSuspensionDialog
          userId={userId}
          suspensionId={activeSuspension.id}
          onClose={() => setShowLiftDialog(false)}
        />
      )}
    </div>
  );
}
