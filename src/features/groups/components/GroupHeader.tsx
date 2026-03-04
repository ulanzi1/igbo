"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CommunityGroup } from "@/db/schema/community-groups";

interface GroupHeaderProps {
  group: CommunityGroup;
  viewerIsCreatorOrLeader?: boolean;
}

export function GroupHeader({ group, viewerIsCreatorOrLeader = false }: GroupHeaderProps) {
  const t = useTranslations("Groups");

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
            {t("members", { count: group.memberCount })}
          </p>
        </div>

        {viewerIsCreatorOrLeader && (
          <Link
            href={`/groups/${group.id}/settings`}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            aria-label={t("settingsTitle")}
          >
            {t("settingsTitle")}
          </Link>
        )}
      </div>
    </div>
  );
}
