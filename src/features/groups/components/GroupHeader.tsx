"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
interface SerializedGroup {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  visibility: string;
  joinType: string;
  postingPermission: string;
  commentingPermission: string;
  memberLimit: number | null;
  creatorId: string;
  memberCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GroupHeaderProps {
  group: SerializedGroup;
  viewerIsCreatorOrLeader?: boolean;
  viewerMembership?: { role: string; status: string } | null;
}

export function GroupHeader({
  group,
  viewerIsCreatorOrLeader = false,
  viewerMembership,
}: GroupHeaderProps) {
  const t = useTranslations("Groups");
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const canLeave = viewerMembership?.status === "active" && viewerMembership.role !== "creator";

  const handleLeave = async () => {
    if (!confirm(t("leaveGroupConfirm"))) return;
    setIsLeaving(true);
    setLeaveError(null);
    try {
      const res = await fetch(`/api/v1/groups/${group.id}/members/self`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        router.push("/groups");
        router.refresh();
      } else {
        const json: unknown = await res.json();
        const detail =
          json !== null && typeof json === "object" && "detail" in json
            ? String((json as { detail: unknown }).detail)
            : t("errors.permissionDenied");
        setLeaveError(detail);
      }
    } catch {
      setLeaveError(t("errors.permissionDenied"));
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Banner */}
      <div className="relative h-48 w-full overflow-hidden bg-muted">
        {group.bannerUrl ? (
          <img src={group.bannerUrl} alt={group.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <span className="text-5xl font-bold text-primary/30">
              {group.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{group.name}</h1>
          {group.description && <p className="text-muted-foreground">{group.description}</p>}
          <p className="text-sm text-muted-foreground">
            {t("memberCount", { count: group.memberCount })}
          </p>
          {leaveError && <p className="text-sm text-destructive">{leaveError}</p>}
        </div>

        <div className="flex shrink-0 gap-2">
          {canLeave && (
            <button
              type="button"
              onClick={() => void handleLeave()}
              disabled={isLeaving}
              className="rounded-md border border-destructive px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {isLeaving ? "..." : t("leaveGroup")}
            </button>
          )}
          {viewerIsCreatorOrLeader && (
            <Link
              href={`/groups/${group.id}/settings`}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              aria-label={t("settingsTitle")}
            >
              {t("settingsTitle")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
