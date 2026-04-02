"use client";

import { useTranslations } from "next-intl";
import { useSessions, useRevokeSession } from "@/features/auth/hooks/use-sessions";

export function SessionList() {
  const t = useTranslations("Auth.security");
  const { data: sessions, isLoading, error } = useSessions();
  const revoke = useRevokeSession();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{t("loadError")}</p>;
  }

  if (!sessions || sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noSessions")}</p>;
  }

  return (
    <ul className="space-y-3">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="flex items-center justify-between rounded-md border px-4 py-3"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{session.deviceName ?? t("deviceUnknown")}</p>
            <p className="text-xs text-muted-foreground">
              {session.deviceIp && `${session.deviceIp} · `}
              {t("lastActive", {
                time: new Date(session.lastActiveAt).toLocaleString(),
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => revoke.mutate(session.id)}
            disabled={revoke.isPending}
            className="text-sm text-destructive hover:underline disabled:opacity-50"
          >
            {t("revokeButton")}
          </button>
        </li>
      ))}
    </ul>
  );
}
